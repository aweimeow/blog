---
title: Nostr 協議：為未來的社交媒體提供更開放、更安全的選擇
date: 2023-04-01 00:00:00
categories: [區塊鏈技術]
tags: [blockchain, nostr, damus]
thumbnail: /images/nostr-intro/nostr.png
---

Nostr 是一個旨在建立一個無法被審查的全球社交網絡的協議。與當前的社交媒體不同，Nostr 旨在提供更安全、更開放和更自由的環境。本篇文章將介紹 Nostr 協議的基本概念，以及如何開始使用 Nostr 作為社交媒體。

<!-- more -->

## Nostr 協議是什麼？

Nostr 是一個基於區塊鏈技術的社交媒體協議（像是 Twitter），不過它與當前的社交媒體不同，Nostr 不依賴於廣告和神秘算法來決定向用戶展示什麼內容，而且使用者之間的互動行為不需仰賴平臺，單靠協議與節點便構建了整個系統。總之，Nostr 協議提供了一個更安全、更開放和更自由的社交媒體環境，它可以讓用戶自由地分享和交流信息，而不用擔心信息被審查或監控。

## Nostr 的核心概念

在此列出 Nostr 的核心概念，以便讀者更好地理解 Nostr 協議。Nostr 網路由一群 Nostr Relay 節點組成：

- Client：使用 Nostr 協議的使用者端 app。使用者透過 Client 連接到 Nostr 網路並發布或接收訊息。常見的 Client 包含：
    - Web 版本：[Coracle](https://coracle.social/), [Snort](https://snort.social/)
    - iOS: [Damus](https://damus.io/), [Nostur](https://nostur.com/), [Current](https://app.getcurrent.io/)
    - Android: [Nostros](https://nostros.net/), [Current](https://app.getcurrent.io/)
- Relay：Nostr 協議的節點，可以想像為負責轉送信件的郵局。Relay 負責中轉和分發訊息。使用者透過連接到 Relay 來加入 Nostr 網路，這裡可以看到[可用的 Relay 列表](https://nostr.watch/relays/find)。你也可以自己架設 Relay，只不過對於一般使用者，不需要自己維護 Nostr 節點也能夠使用 Nostr 網路。
- Note：Nostr 協議中的訊息格式，相當於是 Twitter 的 Tweet。一則 Note 之中會包含作者、簽名、推文內容及其他屬性，可以包含文本、圖片和其他媒體。每個 Note 都具有唯一的 ID，而與 Tweet 的不同之處是： **Note 無法被刪除（除非所有 Relay 都願意幫你刪除，否則是不可能完全消失的）** 。

{% message color:info %}

### 金鑰的重要性：在 Nostr 中保護你的身份和資料

在以往的社交媒體平台中，我們習慣使用帳號和密碼來識別身份。然而，Nostr 的世界有所不同。在這個區塊鏈上運行的社交媒體平台中，身份識別只依賴於金鑰，而不是帳號和密碼。金鑰在 Nostr 中比密碼更加重要。因為金鑰是你的身份憑證，只要有了你的金鑰，就可以冒充你的身份在 Nostr 網路上進行活動。而一旦你的金鑰被遺失或被偷走，就再也無法找回，就像家裡的保險箱被小偷撬開，是找不回來的。

**相較於 Nostr，社交平臺還能夠幫你找回帳號、改密碼。但是在區塊鏈的世界中，被偷走金鑰就意味著什麼都沒有了。**因此，在 Nostr 中，你需要格外小心和謹慎地處理你的金鑰。你需要將它妥善保存在一個安全的地方，確保沒有人能夠輕易地得到它。

{% endmessage %}

## 創建 Nostr 帳號（以 iOS app Damus 為例）

你可以使用各種支援 Nostr 協議的 client app 來建立 Nostr 帳號。系統會為你隨機產生一組金鑰（包含公鑰和私鑰）。

1. 開啟 Damus app，點擊「Create account」按鈕進入帳號創建頁面。
2. 設定你要使用的 Username，按下「Create」按鈕。
3. **妥善** 保管你的公鑰（Public Key）和私鑰（Private Key）。
    - 公鑰：可以想像成是你的 IG 帳號，其他人需要知道你的公鑰才能追蹤、與你互動。
    - 私鑰：可以想像成是你的 IG 密碼，但他沒辦法被更改。請千千萬萬要保管好，用來登入你的帳號。

![Damus 的介面：由左至右為起始畫面、資料設定、金鑰保管](/images/nostr-intro/damus.png)

## 編輯你的個人資料（以 iOS app Damus 為例）

建立了自己的帳號之後，你可以通過應用程式來編輯你的個人資料。以下是常見需要填寫的資訊，除了前面兩項外，其他皆可暫時留白：

- Your name：你的顯示名稱，是別人能辨別出你的身份的資訊。
- Username：使用者名稱，與驗證身份有關。
- Profile Picture：個人檔案照片（純文字，填入圖片網址）。
- Banner Image：封面圖片（純文字，填入圖片網址）。
- Website：網站連結。
- About Me：自我介紹。
- Bitcoin Lightning Address：比特幣閃電網路地址
- NIP-05 Verification：身份驗證資訊（填入支援 NIP-05 的 email 地址）。

{% message %}

### 關於閃電網路與 NIP-05 身份驗證

閃電網路地址是一種比特幣錢包地址，與傳統比特幣地址不同的是，它可以在比特幣的閃電網路上進行快速、低成本的交易。在 Nostr 中，你可以在個人資料中添加閃電網路地址，讓其他用戶可以通過閃電網路直接向你發送比特幣，而不需要像傳統比特幣地址一樣需要等待交易被區塊鏈確認。

而 NIP-05 身份驗證是 Nostr Identity Protocol 的一部分，進行身份驗證後，其他使用者可以藉此知道你的身份沒有被假冒。

在 Nostr 網路上，閃電網路地址和 NIP-05 身份驗證都是非常重要的功能，關於怎麼使用個人 domain 來進行身份驗證與閃電網路地址的綁定，會在之後的文章介紹。

{% endmessage %}

### 結語

在本篇文章中，我們深入探討了 Nostr 協議的核心概念以及如何使用 Nostr 網路進行社交媒體交流。我們了解到，Nostr 協議是一個基於區塊鏈技術的分散式社交媒體協議，它提供了更安全、更開放和更自由的社交媒體環境，讓用戶可以自由地分享和交流信息，而不用擔心信息被審查或監控。

![作者的 Nostr 帳號：npub18v483atquekrap36sx2ualncmzr0spaukf537ymvguxh7sunytusacmkl2](images/nostr-intro/myprofile.png)

*本文由 ChatGPT 協助撰寫與潤稿之下完成*