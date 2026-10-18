---
layout: ../../layouts/Article.astro
slug: grpc-gateway
originalPublished: "2020-11-10 19:00:00"
sections: [["how-the-gateway-fits-into-the-service", "How the gateway fits into the service"], ["define-the-service-protobuf", "Define the service protobuf"], ["implement-the-grpc-service", "Implement the gRPC service"], ["add-the-http-route-annotation", "Add the HTTP route annotation"], ["start-the-http-reverse-proxy", "Start the HTTP reverse proxy"], ["test-the-http-endpoint", "Test the HTTP endpoint"]]
---

While integrating services, I used gRPC for application-to-application communication. An HTTP API would also make development and testing easier: a quick cURL request is more convenient than writing a gRPC client for every check.

[grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) provides that bridge. It generates an HTTP reverse proxy that translates REST-style requests into calls to a gRPC service.

## How the gateway fits into the service

```text
employee.proto
  ├─ protoc + Go plugins → service messages and gRPC stubs
  └─ protoc + grpc-gateway plugin → generated HTTP handlers

HTTP client → HTTP reverse proxy on :8080 → gRPC service on :50050
```

The service definition is shared by both paths. After implementing the gRPC server, the generated gateway forwards matching HTTP requests and converts the responses back into an HTTP representation.

The implementation has four steps:

1. Define the service in Protocol Buffers.
2. Generate the language-specific types and service stubs with `protoc`.
3. Implement the service methods.
4. Generate and start the HTTP reverse proxy.

The examples below retain the original employee-management example. The module path has been replaced with `example.com/employee-service/protos`; it is an illustrative Go module path, not a link to a personal repository. Upstream usage information is available in the [grpc-gateway documentation](https://grpc-ecosystem.github.io/grpc-gateway/).


<figure class="archive-figure"><a href="/images/archive/ePnX1R6.png" aria-label="View full-size image: grpc-gateway translating an HTTP request into a gRPC service call"><img src="/images/archive/ePnX1R6.png" alt="grpc-gateway translating an HTTP request into a gRPC service call" width="749" height="369" loading="lazy" decoding="async" /></a><figcaption>grpc-gateway translating an HTTP request into a gRPC service call.</figcaption></figure>

## Define the service protobuf

Suppose the service stores employee names, genders, and ages. The initial definition is:

```protobuf
syntax = "proto3";
package example;
option go_package = "example.com/employee-service/protos";

service AdminService {
  rpc NewEmployee(EmployeeCreateRequest) returns (EmployeeCreateResponse) {};
}

message EmployeeCreateRequest {
  string Name = 1;
  enum gender {
    MALE = 0; FEMALE = 1; TRANSGENDER = 2; NOTDEFINED = 3;
  }
  gender Gender = 2;
  uint32 Age = 3;
}

message EmployeeCreateResponse {
  bool isSuccess = 1;
  string message = 2;
}
```

Generate the messages and gRPC service stubs:

```bash
protoc -I . -go_out . --go_opt paths=source_relative  \
       -go-grpc_out . --go-grpc_opt paths=source_relative employee.proto
```

After generation, look for `employee.pb.go` and `employee_grpc.pb.go` in the intended package. The input filename has been made explicit in the command above.

## Implement the gRPC service

The original example kept the application's types in `struct.go`:

```go
type Gender uint32
const (
	MALE Gender = iota
	FEMALE
	TRANSGENDER
	NOTDEFINED
)

type Employee struct {
	name string
	gender Gender
	age uint32
}
```

Next, implement the `NewEmployee` method and register the service with a gRPC server. These are the central fragments, not a complete production application with imports and startup orchestration:

```go
var (
	count uint32 = 0
	data = make(map[uint32]*Employee)
)

type Server struct {
	protos.UnimplementedAdminServiceServer
}

func StartGRPCServer() {
    // Listen for gRPC on TCP port 50050
	lis, err := net.Listen("tcp", ":50050")
	if err != nil {
		fmt.Println(err)
	}

	s := grpc.NewServer()
	protos.RegisterAdminServiceServer(s, &Server{})
	reflection.Register(s)

	if err := s.Serve(lis); err != nil {
		fmt.Println(err)
	}
}

func (s *Server) NewEmployee(ctx context.Context, in *protos.EmployeeCreateRequest) (*protos.EmployeeCreateResponse, error) {
	var isSuccess bool = true
	var message string

	if in.Name == "" || in.Age == 0 {
		isSuccess = false
		message = "Employee data wasn't given"
		return &protos.EmployeeCreateResponse{IsSuccess: isSuccess, Message: message}, nil
	}

	newEmployee := &Employee{
		name: in.Name,
		gender: Gender(in.Gender),
		age: in.Age,
	}

	data[count] = newEmployee
	count = count + 1

	fmt.Printf("Employee data: %v", data)

	return &protos.EmployeeCreateResponse{IsSuccess: true, Message: fmt.Sprintf("Employee created: %v", newEmployee)}, nil
}
```

The service listens on TCP port 50050. A request with an empty name or zero age returns a response indicating that employee data was not supplied. An accepted request creates an employee record, stores it under an incrementing identifier, and returns a confirmation.

The map is initialized in this edition so that assigning the first record does not panic. This simple in-memory example also needs synchronization before it is used with concurrent requests, and persistent storage if records must survive a restart.

## Add the HTTP route annotation

The gRPC implementation alone does not define the HTTP API. Import `google/api/annotations.proto` and add a route to the RPC:

```protobuf
import "google/api/annotations.proto";

service AdminService {
  rpc NewEmployee(EmployeeCreateRequest) returns (EmployeeCreateResponse) {
    option (google.api.http) = {
      post: "/employee/create"
      body: "*"
    };
  };
}
```

The annotation maps an HTTP POST to `/employee/create`, with the request body supplying the protobuf message fields. This makes the public path explicit rather than relying on a generated default.

Run `protoc` with the grpc-gateway plugin:

```bash
protoc -I . --grpc-gateway_out . --grpc-gateway_opt logtostderr=true \
            --grpc-gateway_opt paths=source_relative employee.proto
```

The generated `employee.pb.gw.go` contains the HTTP handler registration code. The protobuf include path must contain the imported Google API definitions as well as the local service file.

## Start the HTTP reverse proxy

Most of the translation work is already generated. The remaining application code creates a gateway mux, connects it to the gRPC endpoint, and listens on TCP port 8080:

```go
var (
// Select the gRPC endpoint to forward requests to

grpcServerEndpoint = flag.String("grpc-server-endpoint", "localhost:50050", "gRPC server endpoint")
)

func StartHttpReverseProxyServer() {
	ctx := context.Background()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithInsecure()}

	err := protos.RegisterAdminServiceHandlerFromEndpoint(ctx, mux, *grpcServerEndpoint, opts)
	if err != nil {
		fmt.Println(err)
	}

	if err := http.ListenAndServe(":8080", mux); err != nil {
		fmt.Println(err)
	}
}
```

`RegisterAdminServiceHandlerFromEndpoint` connects the generated HTTP handlers to the gRPC service at `localhost:50050`. The example's insecure connection is for the local demonstration; do not treat it as a transport-security configuration for an exposed service.

Start the gRPC server and the proxy together, ensuring that the gRPC endpoint is available when the gateway begins forwarding requests.

## Test the HTTP endpoint

A missing payload should take the validation path. A request containing employee details should reach the service method:

```bash
# Missing data returns a validation response
$ curl -X POST localhost:8080/employee/create -d ''
{"isSuccess":false,"message":"Employee data wasn't given"}

# Supply employee data to create a record
$ curl -X POST localhost:8080/employee/create -d '{"Name": "William", "Age": 24}'
{"isSuccess":true,"message":"Employee created: Employee{name=William, age=24}"}
```

The malformed JSON closing braces and the “created” spelling in the original sample output have been corrected. Generated response formatting can vary with the gateway version and configuration.

The server also prints its in-memory record map. The original demonstration showed the following shape of output:

```bash
$ go run main.go server.go struct.go
Starting gRPC server
Starting Http reverse proxy server
Employee data: map[0:Employee{name=William, age=24}]
```

The exact formatting depends on the employee type's string representation, but the important behavior is that an HTTP request has created a record through the gRPC method. This keeps the service contract centralized while preserving a convenient HTTP entry point for development and integration.
