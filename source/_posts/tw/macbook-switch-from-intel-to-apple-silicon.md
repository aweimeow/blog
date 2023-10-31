---
title: Macbook Intel chip 遷移到 Apple Silicon (M1/M2) 你該做的事
date: 2023-10-31
categories: [軟體開發]
tags: [macbook]
thumbnail: /images/macbook-switch-from-intel-to-apple-silicon/thumbnail.jpeg
---

Apple 很方便的幫我把我的一切環境還原到新買的 Macbook 上了，然而，快樂的使用了大約兩個月，突然發現以前熟悉的開發環境好像出了狀況，想跑個 AutoGPT 都跑不起來了。因此，我花了一些時間搞懂我的開發環境到底在遷移過程中，發生了什麼事情，並記錄下來。

<!-- more -->

## Apple 到底幫我做了什麼事情？哪裡出了問題？

買新電腦時，為了省麻煩，大家肯定直接用了 [Migration Assistant](https://support.apple.com/en-ie/HT204350) 來把整台電腦的內容傳到新電腦當中。沒錯，Apple 就是原封不動的直接搬移過去，包含路徑也一併過去了。

那麼原封不動過去會有什麼問題呢？舊電腦的應用程式也全部跑到新電腦了。儘管 Apple 貼心的幫你用了一點神奇的魔法（Rosetta 2），讓你的 Macbook M1/M2 可以執行這些應用程式，但你會發現應用程式在開啟時，好像卡卡的，新買的 M1/M2 一點都不像是新的電腦了。

大部分的應用程式因應使用者的需求，都已經支援了 Apple Silicon version 的應用程式，當你在使用原本就安裝在舊電腦的 app 時，碰到卡頓的情況，記得思考一下，是不是還沒有把 Apple silicon 版的 app 裝進去？

![只能把常用的 app 逐一下載回來，安裝 Apple Silicon 的版本到 Macbook 當中](/images/macbook-switch-from-intel-to-apple-silicon/install-vscode.png)


## 令開發者頭痛的 brew 移轉

然而，使用 Macbook 的開發者及使用者不陌生的套件管理程式 - Homebrew，會安裝的路徑放在 `/usr/local` (Intel 晶片) 與 `/opt/homebrew` (Apple Silicon 晶片) [1]，這個路徑的差異會導致程式在執行的時候，沒辦法找到對的 library。

因此，請記得使用 Homebrew 的解除安裝工具：

因為 Homebrew 的解除安裝腳本，把預設 Homebrew 安裝的位置設定在 `/opt/homebrew`，但我們要刪除的是舊電腦的歷史痕跡，因此要額外使用 `-p` 參數來把 `/usr/local` 裡面的 Homebrew 刪除。

```bash
curl https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh -o uninstall.sh
chmod +x uninstall.sh
# Select the old homebrew path to clean up
./uninstall.sh -p /usr/local
```

## 參考

[1] [Homebrew Installation](https://docs.brew.sh/Installation)