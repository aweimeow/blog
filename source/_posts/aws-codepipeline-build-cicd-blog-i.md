---
title: 以 AWS 及 GitHub 為部落格打造 CI/CD Pipeline - 後記
date: 2020-04-11 23:00:00
categories: [軟體開發]
tags: [hexo, cloudfront, buildspec]
thumbnail: https://i.imgur.com/WO6pkKv.png
---

儘管我們的部落格已經架設完畢，也已經能夠用 CodePipeline 進行自動建置部署了，但是使用者瀏覽網站時，可能因為 Hexo 本身與 Hexo 主題的設定比較通用一點（適用於大多數環境，但不完全適用於我們的情境），所以網站上的每一個按鈕、連結我都親自確認過是可以使用的才敢發佈。在這一篇文章當中，我們會說明可能會有的問題和解決方法。

<!--more-->

## 潛在的網站問題

根據 S3 buckets 的 Access Control 設定不同，你的使用者可能會經歷以下問題：
* 造訪不存在的網頁出現 403 Forbindden
> 代表你的 bucket 是沒有 list ability for everyone，這是正確的，否則會出現 404 NotFound。
* 部分連結失效，如：`/archives`, `/posts` 等沒有以 `/` 結尾的網址
> 因為 Lambda 的程式碼單純，我們只針對以 `/` 結尾的網址補全 `index.html` 而已。
* 使用公開程式碼儲存庫，部分隱私資料（或設定檔）公開

前兩個問題是使用者體驗的問題，當使用者在瀏覽網頁時，如果突然見到了由 Amazon 提供的錯誤頁面，也許會滿頭問號。所以，除了設定好自定義的錯誤頁面以外，我們也需要把 Hexo 主題的連結稍微修正一下比較好，例如 `url_for('/archives')` 改成 `url_for('/archives/')`。

![Amazon S3 bucket 回傳的 403 Forbinden 禁止存取錯誤](https://i.imgur.com/MEeiqS1.png)

最後一個問題則是因為我們的程式碼都託管於 GitHub 上，而且是以 public repository 存在的，任何人都可以存取程式碼，如果我們的設定檔當中包含一些比較隱私的資料，如：Google Analytics 的 Tracking ID、Disqus 的 shorturl，或是**其他服務的金鑰** ... 等，那麼把這些資料藏起來就是一件很重要的事情了。

## 新增 404 NotFound 頁面並設定於 CloudFront 當中

和 `/about/` 頁面相同，我們只需要在 `$PROJECT/source/` 底下建立一個 `missing` 的資料夾，並放一個 `index.md` 在裡面，重新 generate 靜態網頁時，就可以看到 **[weiyu.dev/missing/](/missing/)** 已經可以連線到了。

![my customized 404 page](https://i.imgur.com/ahQ7IRG.png)

所以我們已經有一個錯誤頁面可以用了，下一步就是打開 AWS 主控台，`CloudFront > 分佈 > 錯誤頁面`，可以透過這一頁來自訂發生錯誤時的處理方式。如果你的網頁有著「不能回傳 404 Not Found」的需求，你也可以指定在發生 **404 Not Found** 時，回應 **200 OK** 搭配自定義的錯誤頁面。

![建立錯誤回應，由 CloudFront 回傳指定的頁面](https://i.imgur.com/t1D7h6s.png)

在 CloudFront 裡面可以設定大部分常見的 HTTP Status Code 4xx and 5xx，但在現實情況之下，我們比較常碰到也就是那幾個而已，[更多 HTTP 狀態代碼可以參考維基百科](https://zh.wikipedia.org/zh-tw/HTTP状态码#4xx客户端错误)。

## 修改 Hexo 主題使 URL 指向正確的路徑

**其實也沒有所謂的正確與否**，只是因為我們採用 Lambda 作為解決方案，而 Lambda 的腳本太單純，只會把 `/` 結尾的網址多加修飾。如果是 `/archives` 等網址就沒辦法修飾了，**因為我們無從得知這是使用者亂 try 的路徑，還是確實存在需要被補齊的路徑**。

在我的環境當中，我使用的是 [GitHub: ppoffice/hexo-theme-icarus](https://github.com/ppoffice/hexo-theme-icarus/) 作為主題，雖然這個專案沒有 [NexT](https://github.com/theme-next/hexo-theme-next) 這麼多人使用，但支持者仍然不少。**這一個主題有兩個地方需要修改**，一個是導航欄（Navigation Bar）的連結沒有以 `/` 結尾，需要修改主題引擎來 patch 掉這個小問題。另一個是作者 Profile 下的連結：`文章`、`分類`、`標籤` 的連結也是沒有以 `/` 結尾。

這兩個問題都不是什麼大問題，要修改的話其實蠻容易的，只需要改以下兩個檔案就可以了：

* **layout/common/navbar.jsx** [[commit]](https://github.com/aweimeow/hexo-theme-icarus/commit/a93ff7338ae6aa41710b086b08a72f4bfd6b43e3)

{% codeblock layout/common/navbar.jsx lang:javascript https://github.com/aweimeow/hexo-theme-icarus/blob/weiyu.dev/layout/common/navbar.jsx#L42 first_line:38 mark:42 %}
<div class="navbar-menu">
    {Object.keys(menu).length ? <div class="navbar-start">
        {Object.keys(menu).map(name => {
            const item = menu[name];
            return <a class={classname({ 'navbar-item': true, 'is-active': item.active })} href={item.url === "/" ? item.url : item.url.concat("/")}>{name}</a>;
        })}
 </div> : null}
{% endcodeblock %}

* **layout/widget/profile.jsx** [[commit]](https://github.com/aweimeow/hexo-theme-icarus/commit/37c74820c3e6c070f0b45820523a34d36906ba28)

{% codeblock layout/common/navbar.jsx lang:javascript https://github.com/aweimeow/hexo-theme-icarus/blob/weiyu.dev/layout/widget/profile.jsx#L133-L149 first_line:133 mark:137,142,147 %}
counter: {
    post: {
        count: postCount,
        title: _p('common.post', postCount),
        url: url_for('/archives/')
    },
    category: {
        count: categoryCount,
        title: _p('common.category', categoryCount),
        url: url_for('/categories/')
    },
    tag: {
        count: tagCount,
        title: _p('common.tag', tagCount),
        url: url_for('/tags/')
    }
},
{% endcodeblock %}

第一個檔案稍微補充一下，「為什麼不是所有連結都補上 `/`？」，因為 `Home` 的位置本身的 URL 就已經是 `/` 了，如果我們強硬地在每一個網址後面都加上 `/` 的話，那網址就會變成 `//`（file path），不只連不回首頁，還會被瀏覽器 block 掉。

## 使用額外的 GitHub 的 Private Repository 儲存機密

如果你是學生、購買付費會員、企業版用戶的話，GitHub 的私有專案（Private Repository）個數是無上限的，我們可以在 buildspec 當中 clone 我們的私有專案，就可以保護專案的重要資料不會公開在網路上。我把步驟分成下列幾項：

1. 申請 [GitHub Personal Access Token](https://github.com/settings/tokens/new?scopes=repo)
2. 把 TOKEN 作為環境變數放在 CodeBuild 當中
3. 在 `buildspec.yml` 當中把 Private repo 下載下來

第一個步驟的連結是 **申請 GitHub 個人 Token 的設定**，Token 說明可以填入 `AWS CodeBuild for blog pipeline`，這邊的 Note 只需要是你能夠清楚辨識用途的即可。我們需要的權限只是對 repo 的存取權，其他選項都可以不用勾選。

![申請 GitHub access token 所需要的權限](https://i.imgur.com/gxKNFVb.png)

{% colorquote danger %}
記得收好這一串 Token，如果被別人撿到他，就**相當於是擁有讀取你的公共及私有專案的權力**。如果你的 Token 還開了其他權限，甚至還有機會可以覆蓋你的 commits、刪除你的專案。
{% endcolorquote %}

下一步，把 Token 寫入到 CodeBuild 的專案當中，點開 CodeBuild 專案後，找到 `編輯 > 環境 > 其他組態 > 環境變數`，並填上 `GITHUB_OAUTH_KEY`，值則是第一步的那一串文字。

![把 GitHub Access Token 填入到 CI 專案的環境變數當中](https://i.imgur.com/Cqqj1fk.png)

最後則是在 `buildspec.yml` 當中放入 **clone 私有專案的指令**：

```yaml
env:
  variables:
    BLOG_CONF_DIR: "my-blog-config"
    BLOG_CONF_REPO: "aweimeow/my-blog-config.git"

phases:
  pre_build:
    commands:
      - git clone https://$GITHUB_OAUTH_KEY@github.com/$BLOG_CONF_REPO
```

如此一來你就可以用安全的方式得到比較 credential 的檔案了。不過，如果你需要藏起來的東西只是一段 KEY 或 access token 的話，就把它們設定在環境變數當中就可以了，不需要大費周章的做成 private repository，我會使用私有專案是因為我不想要部落格的 `_config.yml` 被其他人看到，因為是檔案所以不容易用環境變數的方式保存。

但是在這邊也提供另外一個解法，可以把檔案放在 S3 bucket 當中，再載入到 CodeBuild 專案就可以了，唯一的小缺點就是更新和版本控管不如 git 的方便，需要透過（我不太熟悉的）aws cli 上傳。

<hr>

這一個系列到此告一段落，我們已經建立起一個擁有完整 CI/CD pipeline 的部落格了，而且可以很方便的把更新文章推到 GitHub 後自動部署到 S3 bucket 當中。**這一套解決方案的開銷會比 VPS 還要節省很多，正常來說 VPS 一個月都是 5 USD ~ 10 USD 最低，自己還需要管理 nginx、domain、SSL 憑證、CDN ... 等。**

部署**在 cloud platform 最大的好處就是可以盡可能的做到 serverless，讓管理的成本大幅降低。**根據我的預估，這一套 pipeline 大約一個月的開銷會在 2 USD 左右，主因是因為 CodePipeline 的收費標準是「只要有一個 active 的 pipeline，就會收費 1 美金」。

總結來說，我認為這個解決方案在建立好之後，不僅省時也省錢，可以參考看看。


