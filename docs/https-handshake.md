# HTTPS 交互流程

<callout emoji="bulb" background-color="light-blue">
标准 HTTPS 连接分三个阶段：**TCP 三次握手** → **TLS 1.2 握手** → **加密 HTTP 通信**。

握手完成后，所有 HTTP 内容均由协商的 `AES-GCM` 会话密钥加密传输，服务端证书在握手期间验证。
</callout>

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    note over C,S: 1. TCP Three-Way Handshake
    C->>S: SYN
    S->>C: SYN-ACK
    C->>S: ACK

    note over C,S: 2. TLS 1.2 Handshake
    C->>S: ClientHello (TLS version, cipher suites, client random)
    S->>C: ServerHello (chosen cipher, server random)
    S->>C: Certificate (server cert chain)
    S->>C: ServerHelloDone
    note over C: Verify certificate chain<br>Extract server public key
    C->>S: ClientKeyExchange (pre-master secret, RSA-encrypted)
    C->>S: ChangeCipherSpec
    C->>S: Finished (HMAC of full handshake)
    S->>C: ChangeCipherSpec
    S->>C: Finished (HMAC of full handshake)
    note over C,S: Both sides derive session keys<br>from client random + server random + pre-master secret

    note over C,S: 3. Encrypted HTTP Exchange
    C->>S: HTTP GET /index.html (AES-GCM encrypted)
    S->>C: HTTP 200 OK + response body (AES-GCM encrypted)
    C->>S: HTTP POST /api/data (AES-GCM encrypted)
    S->>C: HTTP 201 Created (AES-GCM encrypted)
```
