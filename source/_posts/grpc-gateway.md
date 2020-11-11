---
title: 透過 grpc-gateway 來實作 HTTP RESTful 服務
date: 2020-11-10 19:00:00
categories: [軟體開發]
tags: [golang, grpc, grpc-gateway]
thumbnail: https://i.imgur.com/ePnX1R6.png
---

最近開發專案時，為了和其他應用程式界接，所以我用到 gRPC 作為程式間溝通的協定。然而，如果有 HTTP RESTful API 在開發和測試也會更方便，我們就不用寫一個 gRPC client 出來測試功能了，只用 cURL 就可以測試會順利很多。找了找資料後，我逛到了 [grpc-gateway](https://github.com/grpc-ecosystem/grpc-gateway) 這個專案，實作 gRPC server 的同時也**實作 Http Reverse Proxy** 達成目的。

<!-- more -->

## gRPC Gateway 架構簡述

![gRPC Gateway architecture](https://i.imgur.com/ePnX1R6.png)

在上面這張圖當中，我們利用 `profile-service.proto` 來透過 `protoc` 產生出 **gRPC service stub**，而我們也利用 `grpc-gateway` 這個 plugin 來產生 Http reverse proxy。

而我們實作好 gRPC server 也就可以讓 Http reverse proxy 產生作用，把我們的 Http RESTful request 轉換成 gRPC request 並得到結果。

{% colorquote info %}
**實作 gRPC service 的步驟**

其實要以 grpc-gateway 實作 Http reverse proxy 的步驟很簡單，只需要新增一個 gRPC endpoint 來告訴 reverse proxy 要把 RESTful 的請求往哪一個地方轉送，Reverse proxy 就會幫忙把他轉成 gRPC request 並代為向 gRPC server 溝通了。

1. 定義 Service protobuf
2. 以 `protoc` 產生出你開發語言的描述檔案
3. 實作收到 gRPC request 時的動作
4. 實作 Http reverse proxy

{% endcolorquote %}

## 撰寫你的 Service protobuf file

在這邊我直接舉個最常用的例子，假設我們現在要做一個管理員工資料的服務，員工的資料包含：姓名、性別、年紀，那就會像下面一般。

```protobuf
syntax = "proto3";
package example;
option go_package = "github.com/aweimeow/grpc-gateway-example/protos";

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

而這樣子就可以利用這個 proto file 來產生出它的 gRPC service stub 了：

```bash
protoc -I . -go_out . --go_opt paths=source_relative  \
       -go-grpc_out . --go-grpc_opt paths=source_relative
```

檢查一下，你的 protos 資料夾中是不是出現了這些檔案：`employee.pb.go` 和 `employee_grpc.pb.go` 呢？

## 實作 gRPC service

有了剛剛的檔案之後，我們就能夠開始實作這個沒有內容的 gRPC service 了。

我習慣把所有類別的定義都放在 `struct.go` 裡面，這個檔案包含性別的 Enum、員工的 Struct。

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

接著就是實作 Protobuf 定義的 function - `NewEmployee`，下面只擷取最重要的部分，詳細的程式碼請看 GitHub。

```go
var (
	count uint32 = 0
	data map[uint32]*Employee
)

type Server struct {
	protos.UnimplementedAdminServiceServer
}

func StartGRPCServer() {
    // gRPC server 開在 tcp port 50050
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

	return &protos.EmployeeCreateResponse{IsSuccess: true, Message: fmt.Sprintf("Employee craeted: %s", newEmployee)}, nil
}
```

## 修改 Protobuf 來支援 Http reverse proxy

不過，我們雖然實作好 gRPC server 了，但是還要修改一下 proto file 定義 Http request route，雖然他也能自己產生，不過我比較喜歡自訂路徑的方法。

我們需要把 `google/api/annotations.proto` 引入，並且在 `post` 的欄位定義想要使用的路徑，最後再產生 gRPC gateway 的描述檔。

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

下面這個指令會利用 `protoc-gen-grpc-gateway` 產生出對應的 `employee.pb.gw.go`。

```bash
protoc -I . --grpc-gateway_out . --grpc-gateway_opt logtostderr=true \
            --grpc-gateway_opt paths=source_relative employee.proto
```

## 實作 Http reverse proxy server

說是實作，其實就只是啟動一個連接 gRPC server 並監聽在 tcp port 8080 的 service 而已，grpc-gateway 已經幫我們把大部分的工作都做完藏起來了。

```go
var (
// 加上 grpcServerEndpoint 指定要連線的 gRPC server

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

## 試驗環節

一切都寫完了之後，我們可以嘗試對這個 Http RESTful api server 存取看看：

```bash
# 如果沒有給任何資料，則會回傳錯誤
$ curl -X POST localhost:8080/employee/create -d ''
{"isSuccess":false,"message":"Employee data wasn't given"

# 傳送資料並建立起員工資料的狀況
$ curl -X POST localhost:8080/employee/create -d '{"Name": "William", "Age": 24}'
{"isSuccess":true,"message":"Employee craeted: Employee{name=William, age=24}"
```

同時，因為我有在 Server 端把儲存 Employee data 的 map 印出，所以結果如下：

```bash
$ go run main.go server.go struct.go
Starting gRPC server
Starting Http reverse proxy server
Employee data: map[0:Employee{name=William, age=24}]
```
