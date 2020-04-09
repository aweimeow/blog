---
title: 以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 3
date: 2020-04-10 15:15:00
categories: [系統維運]
tags: [aws, s3, lambda, route53, cloudfront, webhosting]
thumbnail: https://i.imgur.com/cfrCEZ1.png
---

設定好了 CodePipeline 與 CodeBuild 之後，我們在 push 新的 commit 到 GitHub 時，應該可以看到 CodePipeline 被觸發，接著啟動了一連串的建置流程，並且把成品部署到 S3 bucket 當中。不過，現在的網站還不算完成，雖然可以透過 AWS S3 的 endpoint 存取到內容了，但是不僅不方便使用者存取，SEO 的排名也不會上去。因此，我們會透過 Route53、CloudFront 與 lambda 來加強網站的使用者體驗。

<!-- more -->

## 什麼都不做的話，網站會是什麼樣子？

{% colorquote info %}
**連得到的網址**
* https://aweimeow-blog-public.s3-ap-northeast-1.amazonaws.com/
* https://aweimeow-blog-public.s3-ap-northeast-1.amazonaws.com/index.html
* https://aweimeow-blog-public.s3-ap-northeast-1.amazonaws.com/archive/index.html

**連不到的網址**
* https://aweimeow-blog-public.s3-ap-northeast-1.amazonaws.com/archive/
{% endcolorquote %}

這一些連結除了不好閱讀以外，還會有一些更實際的問題：**除了 Root directory** 以外，其他的網址沒辦法使用 `/archives/`、`/tags/` 等方式來連線到，所以我搭配了 Lambda 來補全 URL。

除了 Lambda 以外，我還託管我的域名到 Route53，並且搭配 CloudFront CDN 的服務讓使用者體驗更佳。

## 設定 S3 bucket 的 Static Web Hosting

設定很簡單，只要進入 Bucket 的 屬性，就能找到 **靜態網站託管** 的選項，設定 index page 是 `index.html`，就可以直接儲存了。但是在第一章的時候有說過，如果沒有[設定公開存取政策](/aws-codepipeline-build-cicd-blog-1/#設定-CodeBuild-的-bucket-access-權限)，就會沒辦法使用公開的 endpoint 開啟網頁。

## Lambda、Route53 與 CloudFront

![使用者瀏覽網頁時的 Service Chain](https://i.imgur.com/vWLToJf.png)

當使用者在瀏覽網頁時，連線到我的 Domain - `weiyu.dev`，會回應 CloudFront 節點的 URL。當使用者在拜訪 `https://weiyu.dev` 時，實際上拜訪的卻是 `https://d1v********dml.cloudfront.net`，看到的網頁也不會是最新的網頁，而是早在一段時間以前，CloudFront 快取 S3 Bucket 的網頁內容。

**等等，Lambda 在哪裡？**

Lambda 的工作是把網址補全，也就是說，當使用者存取 `https://weiyu.dev/archives/` 的時候，儘管 S3 Bucket 裡面確實有 `archives` 這一個資料夾，而且資料夾中確實也有 `index.html` 這個檔案。但是還是會碰到 **404 Not Found** 的問題，因為 S3 Bucket 的 Default Directory Indexes 只會處理根目錄下的 index.html。

所以當使用者嘗試存取 `https://weiyu.dev/archives/` 時，Lambda 的腳本會判斷使用者連線的網址是什麼，如果是符合正則表達式 `/$`（就是以 `/` 結尾的網址），都會自動補上 `index.html`，就不會出現找不到檔案的問題了。而且使用者對此是完全無感的，因為 CloudFront 就像是一個 Proxy 一樣，它會代替使用者去抓取 S3 bucket 內容，抓取過程中經過 Lambda 修改網址才找得到正確的檔案，所以使用者存取的網址不會改變。

{% colorquote warning %}
**.dev** 的網址是我在 [Google Domain](https://domain.google/) 購買的，因為 Route53 上買不到 .dev，所以我就把 Google 的 NS setting 指向到 Route53 指定的網址了。
{% endcolorquote %}

## 設定 Route53 與 CloudFront

看完上面的故事，這三個服務的功能也能大致瞭解了，我們就來說說設定 Route53 與 CloudFront 的細節吧。

在 Route53 的設定過程，需要先建立一個網域，如果你沒有網域的話也可以直接在 Route53 註冊，或是從 GoDaddy 等域名商註冊，再把 domain 的 NS 指定過來給 Route53 託管就可以了。

準備好了之後就可以開始建立 CloudFront 服務，讓 CloudFront 把 Buckets 內容（網頁內容）快取在遍佈於世界各地的 CDN 節點當中，加速使用者的存取速度。設定 CloudFront 的時候，可以把域名的 SSL 憑證匯入給 ACM（AWS Certificate Manager）管理，或是由 ACM 代為申請。

ACM 會需要我們在 DNS record 裡面放置一個紀錄來供 ACM 查詢，確定我們擁有這個網域的控制權。

![設定 CloudFront 的 Distribution](https://i.imgur.com/PZR2KMY.png)

在設定的過程當中，我們可以設定像是：Default root document、要支援哪一些 HTTP 版本（HTTP/2、HTTP/1.1 ...），以及需不需要 CloudFront 留下記錄檔。不過最重要的是設定 source，也就是我們公開的 S3 bucket `aweimeow-blog-public`。

![在 CloudFront 裡面設定內容來源](https://i.imgur.com/gUjdGD7.png)

讓我們回到 **Route53**，在 Route53 當中，我們可以直接建立 `alias record`，把 `weiyu.dev.` 指向到剛剛建立好的 CloudFront 資源，這樣子就把全部都串起來了。

## 設定 Lambda

但是，**我們還是沒有解決 Default Directory Indexes 的問題**，我們的問題是當使用者存取以 `/` 結尾的網址時，將請求補上 `index.html`，這樣才可以找到對的資源。其實這個需求早就已經被別人實作出來了，我直接使用了他寫的程式碼，請看 [Implementing Default Directory Indexes in Amazon S3-backed Amazon CloudFront Origins Using Lambda@Edge](https://aws.amazon.com/tw/blogs/compute/implementing-default-directory-indexes-in-amazon-s3-backed-amazon-cloudfront-origins-using-lambdaedge/)。

這一篇文章當中，說明了為了效能及擴展性而搭配 CloudFront 服務時，CloudFront 只能夠針對網站根目錄的 index.html 做到 **Default Directory Indexes**，一旦連到其他子網頁，就會造成很差的使用者體驗。所以使用了 Lambda@Edge 來部署一個腳本，當使用者透過 CloudFront 存取網站時，會先觸發部署在 Lambda 上面的腳本程式碼，最後才把請求輸出到 S3 buckets。

{% colorquote danger %}
但是 Lambda@Edge 的功能只支援維吉尼亞州北部（us-east-1），所以你只能把腳本部署在這個區域當中。不過 CloudFront 無論在哪一個 region 都能接到部署在 `us-east-1` 的 Lambda 腳本，不用擔心。
{% endcolorquote %}

### Default Directory 腳本

在這裡使用的是 NodeJS 來執行腳本，我原本也想要用 Python 來寫，不過既然都有現成的就直接使用了。

```javascript
// Code Credit: https://aws.amazon.com/tw/blogs/compute/implementing-default-directory-indexes-in-amazon-s3-backed-amazon-cloudfront-origins-using-lambdaedge/
'use strict';
exports.handler = (event, context, callback) => {
    var request = event.Records[0].cf.request;
    var olduri = request.uri;
    var newuri = olduri.replace(/\/$/, '\/index.html');
    request.uri = newuri;
    return callback(null, request);
};
```

這個腳本也就只是把網址結尾的 `/` 部分，取代為 `/index.html`。Lambda 可以用很方便的方式來部署 serverless computing，而且基本上部落格的流量也不至於超過免費額度。

<hr>

不知不覺當中，已經把三篇都寫完了，下一篇則是著重在講述**部署時的技巧**和 **Hexo 主題的修改方式**，如果不對主題修改的話，搭配 Static Web Hosting 還是會造成許多連結 **404 Not Found** 的情況發生。所以文章基本上與 AWS 的服務無關。

但如果你也使用 Hexo blog engine，那說不定下一篇的內容會對你在部署 Hexo 到 AWS 會有些幫助。

下一篇：以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - I （後記篇）
