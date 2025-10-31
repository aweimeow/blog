---
title: Karpenter 介紹與核心原始碼導讀
date: 2024-01-12
categories: [系統維運]
tags: [karpenter, kubernetes]
thumbnail: /images/karpenter-mechanism/thumbnail.png
---

{% multilanguage en karpenter-mechanism %}


{% message color:danger %}
**注意**：這一篇文章已經過時！
{% endmessage %}

這一篇文章中，主要介紹了 Karpenter 的核心運作流程，包含 Karpenter 如何過濾需要被規劃的 Pod，以及實際 Pod 被規劃到工作節點上的過程。

<!-- more -->

## 前言

Karpenter 是一套由 AWS 設計的工具，針對 Kubernetes 叢集中的工作節點（instance）根據工作負載（workload）來擴充叢集規模，而 Karpenter 有以下幾個功能與特色：

1. **監控處於 Unschedulable 狀態的 Pods**：Karpenter 監控由 kube-scheduler 標記為 Unschedulable 的 Pods。
2. **評估 Pod 的需求**：Karpenter會檢視 Pods 要求的各種限制，包括資源需求、標籤（nodeSelector）、Node Affinity、Tolerance 等訊息。確保了新建立的工作節點能夠滿足 Pods 的服務需求。
3. **提供符合需求的節點**：根據上述評估結果，Karpenter 會動態地分配（provision）符合 Pods 需求的節點。透過 NodePool Template 產生出對應的節點進行有規模的部署。
4. **節點的動態管理**：當節點不再需要時，Karpenter 會進行調配，終止不被需要的工作節點。


## Karpenter 的 Pod 規劃機制

Karpenter的工作流程主要分為兩部分：確定哪些 Pod 需要被分配到工作節點當中，以及實際分配 Pod 到工作節點的過程。以下除了解釋以外，還會搭配原始碼搭配引導閱讀，原始碼採用目前最新的穩定版本 v0.33.1。主要用以分配 Pod 核心邏輯為 [`func (p *Provisioner) Schedule(ctx context.Context)` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L296-L337)。

#### 1. 如何確定哪些 Pod 需要被分配到工作節點

Karpenter使用 [`GetPendingPods` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L154-L176) 來取得處於 Pending 狀態的 Pod 列表，這裡所說的 Pending 與我們平常認知的 Kubernetes Pod Pending 不同。這裡說的 Pending 是由 Karpenter 的程式邏輯判斷，需要被 Karpenter 分配到節點，卻還在「等待（Pending）」被分配的 Pod。該過程與 Kubernetes API server 互動，透過 "List" 操作列出 Pod 列表，並遵循以下規則來標記 Pod 是否為 Pending Pod。

```go
func IsProvisionable(pod *v1.Pod) bool {
	return !IsScheduled(pod) &&
		!IsPreempting(pod) &&
		FailedToSchedule(pod) &&
		!IsOwnedByDaemonSet(pod) &&
		!IsOwnedByNode(pod)
}
```

而這裡的 `IsProvisionable` 需要為 `True` 才會將 Pod 標記為 Pending Pod，也就是說，以下所有條件皆要滿足，條件包含：

- `!IsScheduled(pod)`：Pod 的 `pod.Spec.NodeName` 為空，表示還沒有被分配到任一工作節點。
- `!IsPreempting(pod)`: Pod 的 `pod.Status.NominatedNodeName` 為空，表示還沒有被分配到任一「即將被建立」的節點。
- `FailedToSchedule(pod)`: Pod 的狀態存在 FailedToSchedule（`PodReasonUnschedulable`）。
- `!IsOwnedByDaemonSet(pod)`: Pod 不是 DaemonSet 的 Pod。
- `!IsOwnedByNode(pod)`: Pod 不是 [Static Pod](https://kubernetes.io/docs/tasks/configure-pod-container/static-pod/)。

#### 2. 在確認必須被規劃的 Pod 之後，這些 Pod 如何被分配？

當 Karpenter 獲得 Pending Pod 的清單後，會逐一針對每一個 Pod 進行分配。首先，以下程式碼為 [`Solve` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/scheduling/scheduler.go#L138-L187)。這個 Solve function 會使用 for 迴圈去輪詢每一個 Pod，並且使用 `s.add()` 函式來嘗試把 Pod 分配到節點當中。

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

在 [`add` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/scheduling/scheduler.go#L236-L283) 當中，他會做以下嘗試：
1. 嘗試把 Pod 放到現在已有的節點當中
2. 嘗試把 Pod 放到即將創建的節點（NodeClaims）當中
3. 嘗試建立新的節點，並把 Pod 放到新的節點當中

每一次的嘗試過程，都會確定 Pod 與目標節點是不是符合了所有要件，可以參考 [5] 裡面的程式邏輯，這些條件包含：
1. Node 上的污點（Taint）是否符合
2. Node 上的 hostport 是否與 Pod 有衝突
3. Node Affinity 是否符合
4. topologyRequirements 是否符合（我沒有往下深入研究這個名詞在原始碼中的含意，歡迎補充）

當我們已經把 Pod 能分配的都分配完了，剩下還在 queue 當中的 Pod 就會為分配失敗的 Pod，Karpenter 會發送 `PodFailedToScheduleEvent` 到 Kubernetes API Server 當中記錄，這時也能夠在 `kubectl describe pod <pod-name>` 的時候注意到這個由 Karpenter 產生並寫入 Kubernetes control plane 的 Pod 事件。
```go
		// If unsuccessful, relax the pod and recompute topology
		relaxed := s.preferences.Relax(ctx, pod)
		q.Push(pod, relaxed)   <------ 把 Pod 放回 queue 當中
		if relaxed {
			if err := s.topology.Update(ctx, pod); err != nil {
				logging.FromContext(ctx).Errorf("updating topology, %s", err)
			}
		}
	...
	
	if !s.opts.SimulationMode {
		s.recordSchedulingResults(ctx, pods, q.List(), errors, time.Since(schedulingStart))    <---- 呼叫 recordSchedulingResults 將 q.List()，也就是分配失敗的 Pod 寫入 PodFailedToScheduleEvent
	}

...

func (s *Scheduler) recordSchedulingResults(ctx context.Context, pods []*v1.Pod, failedToSchedule []*v1.Pod, errors map[*v1.Pod]error, schedulingDuration time.Duration) {
	// Report failures and nominations
	for _, pod := range failedToSchedule {
		logging.FromContext(ctx).With("pod", client.ObjectKeyFromObject(pod)).Errorf("Could not schedule pod, %s", errors[pod])
		s.recorder.Publish(PodFailedToScheduleEvent(pod, errors[pod]))  <---- 推送事件
	}
```

而在 `Schedule` function 的結束後，我們回到 [`Reconcile` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L112-L135) 看看程式碼，Reconcile 在執行完分配以後，會呼叫 [`CreateNodeClaims` function](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L139-L152) 實際建立新的工作節點，並且為[推送 NominatePodEvent](https://github.com/kubernetes-sigs/karpenter/blob/v0.33.1/pkg/controllers/provisioning/provisioner.go#L360-L362) 至 Kubernetes API server。這也是為什麼我們能夠在使用了 Karpenter 時，去 `kubectl describe pod` 時，能夠看到 Nominate 的訊息。

然而，讀完程式碼改變我想法的地方是，原來 Karpenter 僅負責規劃（Schedule function）Pod 應該被放置到哪些節點，以及分配（CreateNodeClaims）節點到你的 Kubernetes 叢集裡面，他並不會負責去實際把 Pod 指派到節點當中，這個工作還是由原生的 kube-scheduler 來達成。

## 結語

這篇文章主要是因為需要瞭解 Karpenter 實際做了什麼，於是花了時間去研究他的程式邏輯。如果想要試玩 Karpenter 的話，可以參考 [EKS workshop - Karpenter 一節](https://www.eksworkshop.com/docs/autoscaling/compute/karpenter/) 來一鍵部署環境起來玩玩。

