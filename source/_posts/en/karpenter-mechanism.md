---
title: Introduction of Karpenter and Learn the Mechanism by Source Code
date: 2024-01-12
categories: [系統維運]
tags: [karpenter, kubernetes]
thumbnail: /images/karpenter-mechanism/thumbnail.png
---

{% multilanguage tw karpenter-mechanism %}

This article primarily introduces the core operational process of Karpenter, including how Karpenter filters Pods that need to be scheduled and the actual process of scheduling Pods onto worker nodes.

<!-- more -->

## Introduction

Karpenter is a tool designed by AWS for Kubernetes clusters. It scales the cluster based on the workload of worker nodes (instances). Karpenter has several features and functions:

1. **Monitoring Unschedulable Pods**: Karpenter monitors Pods marked as Unschedulable by the kube-scheduler.
2. **Assessing Pod Needs**: Karpenter examines various requirements of Pods, including resource demands, labels (nodeSelector), Node Affinity, Tolerance, etc., to ensure new worker nodes can meet the service requirements of Pods.
3. **Providing Suitable Nodes**: Based on the above assessment, Karpenter dynamically allocates nodes that meet the requirements of the Pods. Nodes are deployed on a large scale through the NodePool Template.
4. **Dynamic Management of Nodes**: When nodes are no longer needed, Karpenter reallocates resources and terminates unnecessary worker nodes.

## Karpenter's Pod Scheduling Mechanism

Karpenter's workflow is mainly divided into two parts: determining which Pods need to be allocated to worker nodes and the actual allocation of Pods to these nodes. In addition to the explanation, this also includes guidance for reading the source code. The source code uses the latest stable version, v0.33.1. The core logic for allocating Pods is in [`func (p *Provisioner) Schedule(ctx context.Context)` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L296-L337).

#### 1. How to Determine Which Pods Need to Be Allocated to Worker Nodes

Karpenter uses the [`GetPendingPods` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L154-L176) to obtain a list of Pods in the Pending state. The Pending state here is different from the usual Kubernetes Pod Pending. This refers to Pods that Karpenter's program logic has determined need to be allocated to nodes but are still "waiting (Pending)" to be allocated. This process interacts with the Kubernetes API server, listing Pods using the "List" operation, and follows these rules to mark whether a Pod is a Pending Pod.

```go
func IsProvisionable(pod *v1.Pod) bool {
	return !IsScheduled(pod) &&
		!IsPreempting(pod) &&
		FailedToSchedule(pod) &&
		!IsOwnedByDaemonSet(pod) &&
		!IsOwnedByNode(pod)
}
```


Here, `IsProvisionable` needs to be `True` for the Pod to be marked as a Pending Pod. This means all the following conditions must be met:

- `!IsScheduled(pod)`: Pod's `pod.Spec.NodeName` is empty, indicating it has not been allocated to any worker node.
- `!IsPreempting(pod)`: Pod's `pod.Status.NominatedNodeName` is empty, indicating it has not been allocated to any "upcoming" node.
- `FailedToSchedule(pod)`: The status of the Pod includes FailedToSchedule (`PodReasonUnschedulable`).
- `!IsOwnedByDaemonSet(pod)`: The Pod is not a DaemonSet Pod.
- `!IsOwnedByNode(pod)`: The Pod is not a [Static Pod](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/).


#### 2. After Confirming the Pods That Must Be Scheduled, How Are These Pods Allocated?

After Karpenter obtains the list of Pending Pods, it allocates each Pod one by one. First, the following code is the [`Solve` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/scheduling/scheduler.go#L138-L187). This Solve function uses a for loop to poll each Pod and uses the `s.add()` function to attempt to allocate the Pod to a node.

```go
func (s *Scheduler) Solve(ctx context.Context, pods []*v1.Pod) *Results {
	defer metrics.Measure(schedulingSimulationDuration)()
	schedulingStart := time.Now()
	// We loop trying to schedule unschedulable pods as long as we are making progress.  This solves a few
	// issues including pods with affinity to another pod in the batch. We could topo-sort to solve this, but it wouldn't
	// solve the problem of scheduling pods where a particular order is needed to prevent a max-skew violation. E.g. if we
	// had 5xA pods and 5xB pods were they have a zonal topology spread, but A can only go in one zone and B in another.
	// We need to schedule them alternating, A, B, A, B, .... and this solution also solves that as well.
	errors := map[*v1.Pod]error{}
	q := NewQueue(pods...)
	for {
		// Try the next pod
		pod, ok := q.Pop()
		if !ok {
			break
		}

		// Schedule to existing nodes or create a new node
		if errors[pod] = s.add(ctx, pod); errors[pod] == nil {
			continue
		}

		// If unsuccessful, relax the pod and recompute topology
		relaxed := s.preferences.Relax(ctx, pod)
		q.Push(pod, relaxed)
		if relaxed {
			if err := s.topology.Update(ctx, pod); err != nil {
				logging.FromContext(ctx).Errorf("updating topology, %s", err)
			}
		}
	}

	for _, m := range s.newNodeClaims {
		m.FinalizeScheduling()
	}
	if !s.opts.SimulationMode {
		s.recordSchedulingResults(ctx, pods, q.List(), errors, time.Since(schedulingStart))
	}
	// clear any nil errors so we can know that len(PodErrors) == 0 => all pods scheduled
	for k, v := range errors {
		if v == nil {
			delete(errors, k)
		}
	}
	return &Results{
		NewNodeClaims: s.newNodeClaims,
		ExistingNodes: s.existingNodes,
		PodErrors:     errors,
	}
}
```

In the [`add` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/scheduling/scheduler.go#L236-L283), it attempts the following:

1. Try to put the Pod into existing nodes.
2. Try to put the Pod into nodes that are about to be created (NodeClaims).
3. Try to create new nodes and put the Pod into the new nodes.

Each attempt ensures that the Pod and target node meet all requirements, which can be seen in [5]'s program logic. These conditions include:

1. Whether the node's taint matches
2. Whether the node's hostport conflicts with the Pod
3. Whether the Node Affinity matches
4. Whether the topologyRequirements match (I have not delved into the meaning of this term in the source code; feel free to add)


Once we have allocated all the Pods we can, the remaining Pods in the queue will be the ones that failed to allocate. Karpenter will send a `PodFailedToScheduleEvent` to the Kubernetes API Server for recording. At this point, you can also notice this event generated by Karpenter and written into the Kubernetes control plane when using `kubectl describe pod <pod-name>`.

```go
		// If unsuccessful, relax the pod and recompute topology
		relaxed := s.preferences.Relax(ctx, pod)
		q.Push(pod, relaxed)   <------ Push the Pod back into the queue
		if relaxed {
			if err := s.topology.Update(ctx, pod); err != nil {
				logging.FromContext(ctx).Errorf("updating topology, %s", err)
			}
		}
	...
	
	if !s.opts.SimulationMode {
		s.recordSchedulingResults(ctx, pods, q.List(), errors, time.Since(schedulingStart))    <---- Calls recordSchedulingResults to write q.List(), the Pods that failed to allocate, into PodFailedToScheduleEvent
	}

...

func (s *Scheduler) recordSchedulingResults(ctx context.Context, pods []*v1.Pod, failedToSchedule []*v1.Pod, errors map[*v1.Pod]error, schedulingDuration time.Duration) {
	// Report failures and nominations
	for _, pod := range failedToSchedule {
		logging.FromContext(ctx).With("pod", client.ObjectKeyFromObject(pod)).Errorf("Could not schedule pod, %s", errors[pod])
		s.recorder.Publish(PodFailedToScheduleEvent(pod, errors[pod]))  <---- Publish the event
	}
```

After the end of the `Schedule` function, we return to the [`Reconcile` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L112-L135) to examine the code. Once Reconcile has completed the allocation process, it calls the [`CreateNodeClaims` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L139-L152) to actually create new work nodes and push [NominatePodEvent](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L360-L362) to the Kubernetes API server. This is why, when using Karpenter, we can see the Nominate messages when running `kubectl describe pod`.

However, reading the code changed my perspective. It turns out that Karpenter is only responsible for planning (Schedule function) where Pods should be placed and allocating (CreateNodeClaims) nodes to your Kubernetes cluster. It does not take on the task of actually assigning Pods to nodes; this job is still accomplished by the native kube-scheduler.

## Conclusion

This article primarily arose from the need to understand what Karpenter actually does, leading me to spend time studying its programming logic. If you're interested in trying out Karpenter, you can refer to the [EKS workshop - Karpenter section](https://www.eksworkshop.com/docs/autoscaling/compute/karpenter/) for a one-click deployment to play around with it.
