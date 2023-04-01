---
title: 'Nostr Protocol: Providing a More Open and Secure Option for Future Social Media'
date: 2023-04-01 00:00:00
categories: [區塊鏈技術]
tags: [blockchain, nostr, damus]
thumbnail: /images/nostr-intro/nostr.png
---

{% multilanguage tw nostr-intro %}

Nostr is a protocol designed to create a globally uncensorable social network. Unlike current social media, Nostr aims to provide a more secure, open, and free environment. This article will introduce the basic concepts of the Nostr protocol and how to use it as a social media platform.

<!-- more -->

## What is the Nostr protocol?

Nostr is a social media protocol based on blockchain technology (like Twitter), but unlike current social media, Nostr does not rely on ads and mysterious algorithms to decide what content to show users. Additionally, user interaction does not depend on the platform, but instead the protocol and nodes construct the entire system. In summary, the Nostr protocol provides a more secure, open, and free social media environment that allows users to freely share and communicate information without fear of censorship or surveillance.

## Core concepts of Nostr

Here are the core concepts of Nostr to help readers better understand the Nostr protocol. The Nostr network consists of a group of Nostr Relay nodes:

- Client: A user-side app that uses the Nostr protocol. Users connect to the Nostr network through the Client to publish or receive messages. Common Clients include:
    - Web version: [Coracle](https://coracle.social/), [Snort](https://snort.social/)
    - iOS: [Damus](https://damus.io/), [Nostur](https://nostur.com/), [Current](https://app.getcurrent.io/)
    - Android: [Nostros](https://nostros.net/), [Current](https://app.getcurrent.io/)
- Relay: A Nostr protocol node, which can be imagined as a post office responsible for forwarding letters. Relay is responsible for forwarding and distributing messages. Users join the Nostr network by connecting to a Relay, and here you can see the [available Relay list](https://nostr.watch/relays/find). You can also set up a Relay yourself, but for regular users, you don't need to maintain Nostr nodes to use the Nostr network.
- Note: The message format in the Nostr protocol, which is equivalent to Twitter's Tweet. A Note contains the author, signature, tweet content, and other attributes, and can contain text, images, and other media. Each Note has a unique ID, and unlike a Tweet, a Note cannot be deleted (unless all Relays are willing to help you delete it, it is impossible to completely disappear).

{% message color:info %}

### The importance of keys: Protecting your identity and data in Nostr

In past social media platforms, we are used to using account names and passwords to identify ourselves. However, the world of Nostr is different. In this social media platform that runs on the blockchain, identity is only dependent on keys, not on account names and passwords. Keys are more important than passwords in Nostr because keys are your identity credentials. Once someone has your key, they can impersonate you and do activities on the Nostr network on your behalf. And once your key is lost or stolen, it can never be retrieved, just like a safe at home that was broken into by a thief cannot be recovered.

**Compared to traditional social platforms, social platforms can help you recover your account or change your password. But in the world of blockchain, having your key stolen means you lose everything.** Therefore, in Nostr, you need to be extra careful and cautious in handling your keys. You need to keep them safe in a secure place, making sure that no one can easily obtain them.

{% endmessage %}

## Creating a Nostr Account (using iOS app Damus as an example)

You can use any client app that supports the Nostr protocol to create a Nostr account. The system will generate a set of keys for you randomly (including public and private keys).

1. Open the Damus app and click the "Create account" button to enter the account creation page.
2. Set the username you want to use and click the "Create" button.
3. **Keep your public key and private key safe**.
    - Public key: can be thought of as your Instagram account, other people need to know your public key to follow and interact with you.
    - Private key: can be thought of as your Instagram password, but it cannot be changed. Please keep it safe to log in to your account.

![Damus interface: from left to right are the starting screen, data settings, and key management](/images/nostr-intro/damus.png)

## Editing your profile (using iOS app Damus as an example)

After creating your account, you can edit your profile through the application. Here are some common information to fill in, except for the first two items, others can be temporarily left blank:

- Your name: your display name, which is information that others can use to identify you.
- Username: the username is related to identity verification.
- Profile Picture: a profile picture (pure text, fill in the image URL).
- Banner Image: cover picture (pure text, fill in the image URL).
- Website: website link.
- About Me: self-introduction.
- Bitcoin Lightning Address: Bitcoin Lightning Network address.
- NIP-05 Verification: Identity verification information (fill in the email address that supports NIP-05).

{% message %}

### About Lightning Network and NIP-05 Identity Verification

The Lightning Network address is a type of Bitcoin wallet address. Unlike traditional Bitcoin addresses, it can be used for fast and low-cost transactions on the Bitcoin Lightning Network. In Nostr, you can add Lightning Network addresses to your profile, allowing other users to send bitcoins directly to you via the Lightning Network, without waiting for the transaction to be confirmed on the blockchain, as with traditional Bitcoin addresses.

NIP-05 verification is part of the Nostr Identity Protocol. After identity verification, other users can verify that your identity has not been falsified.

On the Nostr network, Lightning Network addresses and NIP-05 identity verification are both important features. More about how to use a personal domain for identity verification and binding Lightning Network addresses will be introduced in future articles.

{% endmessage %}

### Conclusion

In this article, we have delved into the core concepts of the Nostr protocol and how to use the Nostr network for social media communication. We understand that the Nostr protocol is a decentralized social media protocol based on blockchain technology. It provides a more secure, open, and free social media environment, allowing users to freely share and exchange information without worrying about censorship or monitoring.

![Author's Nostr account: npub18v483atquekrap36sx2ualncmzr0spaukf537ymvguxh7sunytusacmkl2](images/nostr-intro/myprofile.png)
