# Technical Design Document: Real-Time Chat Feature

## Document Metadata
- **Version**: 1.0
- **Date**: 2026-02-12
- **Author**: Technical Design Team
- **Status**: Draft

## Executive Summary

This document outlines the technical design for implementing a real-time chat feature in the Employee Management Application. The feature will enable employees to communicate in real-time using WebSocket technology, with messages persisted in PostgreSQL for reliability and audit purposes. The system is designed to support 10,000 concurrent users with end-to-end encryption ensuring message privacy and security.

---

## 1. Problem Statement

### 1.1 Current State
The Employee Management Application currently provides CRUD operations for employee records but lacks real-time communication capabilities. Employees need to rely on external communication tools for collaboration, which:
- Reduces productivity by requiring context switching
- Creates data silos outside the main application
- Lacks integration with employee profiles and organizational structure
- Has no audit trail for business communications

### 1.2 Business Requirements
- **BR-1**: Enable real-time messaging between employees
- **BR-2**: Support both one-on-one and group conversations
- **BR-3**: Maintain message history for compliance and reference
- **BR-4**: Ensure message privacy with end-to-end encryption
- **BR-5**: Scale to support 10,000 concurrent users
- **BR-6**: Provide message delivery status (sent, delivered, read)
- **BR-7**: Support message search and filtering (client-side due to E2EE)
- **BR-8**: Enable presence indicators (online/offline status)

### 1.3 Technical Requirements
- **TR-1**: Use WebSocket protocol for real-time bidirectional communication
- **TR-2**: Store messages in PostgreSQL for persistence and reliability
- **TR-3**: Implement end-to-end encryption (E2EE) for message content
- **TR-4**: Support horizontal scaling for 10,000+ concurrent connections
- **TR-5**: Achieve message delivery latency < 100ms (p95)
- **TR-6**: Ensure 99.9% uptime for chat service
- **TR-7**: Handle graceful degradation during server failures
- **TR-8**: Maintain compatibility with existing authentication system

---

## 2. Proposed Solution

### 2.1 High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        C1[React Chat UI]
        C2[WebSocket Client]
        C3[Crypto Library<br/>Signal Protocol]
    end
    
    subgraph "Load Balancer Layer"
        LB[Nginx/HAProxy<br/>Sticky Sessions]
    end
    
    subgraph "Application Layer"
        WS1[WebSocket Server 1<br/>Socket.io]
        WS2[WebSocket Server 2<br/>Socket.io]
        WS3[WebSocket Server N<br/>Socket.io]
        API[REST API Server<br/>Express]
    end
    
    subgraph "Message Queue Layer"
        REDIS[Redis Pub/Sub<br/>Message Broker]
    end
    
    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Message Storage)]
        CACHE[(Redis Cache<br/>User Presence)]
    end
    
    C1 --> C2
    C1 --> C3
    C2 --> LB
    LB --> WS1
    LB --> WS2
    LB --> WS3
    WS1 --> REDIS
    WS2 --> REDIS
    WS3 --> REDIS
    WS1 --> PG
    WS2 --> PG
    WS3 --> PG
    WS1 --> CACHE
    WS2 --> CACHE
    WS3 --> CACHE
    API --> PG
    C1 --> API
```

### 2.2 System Components

#### 2.2.1 Frontend Components

**React Chat UI Component**
- **Responsibility**: Render chat interface, manage local state, handle user interactions
- **Key Features**:
  - Message composition and display
  - Conversation list with unread indicators
  - Typing indicators
  - Message status indicators (sent/delivered/read)
  - Search and filter functionality (client-side on decrypted messages)
- **Dependencies**: React, Socket.io-client, libsignal-protocol-javascript

**WebSocket Client Manager**
- **Responsibility**: Manage WebSocket connections, handle reconnection logic
- **Key Features**:
  - Automatic reconnection with exponential backoff
  - Connection state management
  - Message queuing during disconnection
  - Heartbeat mechanism for connection monitoring
- **Implementation**: Custom hook using Socket.io-client

**E2E Encryption Client**
- **Responsibility**: Encrypt outgoing messages, decrypt incoming messages
- **Key Features**:
  - Key generation and storage
  - Signal Protocol implementation
  - Key exchange management
  - Forward secrecy
- **Library**: libsignal-protocol-javascript

#### 2.2.2 Backend Components

**WebSocket Server (Socket.io)**
- **Responsibility**: Handle real-time bidirectional communication
- **Key Features**:
  - WebSocket connection management
  - Room-based message routing
  - Presence tracking
  - Message acknowledgment
  - Rate limiting per connection
- **Technology**: Socket.io on Node.js
- **Scaling**: Multiple instances with Redis adapter

**Message Service**
- **Responsibility**: Business logic for message processing
- **Key Features**:
  - Message validation
  - Metadata extraction
  - Database persistence
  - Message delivery tracking
  - Push notification triggers
- **Pattern**: Service layer with async/await

**Authentication & Authorization Service**
- **Responsibility**: Verify user identity and permissions
- **Key Features**:
  - JWT token validation
  - WebSocket authentication
  - Role-based access control
  - Rate limiting
- **Integration**: Reuse existing auth system

**REST API Extension**
- **Responsibility**: HTTP endpoints for chat operations
- **Endpoints**:
  - `GET /api/chat/conversations` - List conversations
  - `GET /api/chat/messages/:conversationId` - Get message history
  - `POST /api/chat/conversations` - Create conversation
  - `PUT /api/chat/messages/:id/read` - Mark as read
  - `GET /api/chat/search` - Search messages
- **Technology**: Express.js

#### 2.2.3 Infrastructure Components

**Redis Pub/Sub**
- **Responsibility**: Message broker for multi-server communication
- **Purpose**: Synchronize messages across WebSocket server instances
- **Features**:
  - Low-latency message broadcasting
  - Presence synchronization
  - Typing indicators distribution

**Redis Cache**
- **Responsibility**: High-speed data caching
- **Cached Data**:
  - User presence status (online/offline)
  - Active connections mapping
  - Recent messages (last 50 per conversation)
  - User session data
- **TTL Strategy**: 
  - Presence: 30 seconds (with heartbeat refresh)
  - Messages: 1 hour
  - Session data: Match JWT expiration

**PostgreSQL Database**
- **Responsibility**: Persistent message and conversation storage
- **Schema**: See Section 3.2
- **Features**:
  - ACID compliance for message integrity
  - Full-text search capability
  - Efficient indexing for queries
  - Partitioning strategy for scale

**Load Balancer (Nginx/HAProxy)**
- **Responsibility**: Distribute connections across WebSocket servers
- **Configuration**:
  - Sticky sessions (IP hash) for WebSocket connections
  - Health checks for server availability
  - SSL termination
  - WebSocket upgrade support

---

## 3. Detailed Design

### 3.1 Data Models

#### 3.1.1 PostgreSQL Schema

```sql
-- Conversations table
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
    name VARCHAR(255), -- For group chats
    created_by INTEGER REFERENCES employees(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB -- Extensible field for future features
);

CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- Conversation participants
CREATE TABLE conversation_participants (
    id BIGSERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_at TIMESTAMP,
    is_muted BOOLEAN DEFAULT FALSE,
    notification_level VARCHAR(20) DEFAULT 'all' CHECK (notification_level IN ('all', 'mentions', 'none')),
    UNIQUE(conversation_id, employee_id)
);

CREATE INDEX idx_conv_participants_conv_id ON conversation_participants(conversation_id);
CREATE INDEX idx_conv_participants_emp_id ON conversation_participants(employee_id);
CREATE INDEX idx_conv_participants_last_read ON conversation_participants(last_read_at);

-- Messages table (partitioned by month for scalability)
CREATE TABLE messages (
    id BIGSERIAL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES employees(id),
    content_encrypted TEXT NOT NULL, -- E2E encrypted content
    content_type VARCHAR(50) DEFAULT 'text' CHECK (content_type IN ('text', 'file', 'image', 'system')),
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    reply_to_id BIGINT, -- For threaded replies
    metadata JSONB, -- Attachments, reactions, etc.
    PRIMARY KEY (id, sent_at)
) PARTITION BY RANGE (sent_at);

-- Create partitions for current and next 12 months
CREATE TABLE messages_2026_02 PARTITION OF messages
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE messages_2026_03 PARTITION OF messages
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... (continue for all months)

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, sent_at DESC);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
-- Note: Full-text search on encrypted content is not possible server-side
-- Search functionality will be implemented client-side after decryption
-- or using a separate metadata field for searchable tags/keywords

-- Message delivery tracking
CREATE TABLE message_deliveries (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL,
    recipient_id INTEGER NOT NULL REFERENCES employees(id),
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    UNIQUE(message_id, recipient_id)
);

CREATE INDEX idx_deliveries_message_id ON message_deliveries(message_id);
CREATE INDEX idx_deliveries_recipient_id ON message_deliveries(recipient_id);

-- User encryption keys (for E2E encryption)
CREATE TABLE user_encryption_keys (
    id BIGSERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    key_type VARCHAR(50) NOT NULL CHECK (key_type IN ('identity', 'signed_prekey', 'one_time_prekey')),
    public_key TEXT NOT NULL,
    key_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(employee_id, key_type, key_id)
);

CREATE INDEX idx_encryption_keys_employee ON user_encryption_keys(employee_id);
CREATE INDEX idx_encryption_keys_active ON user_encryption_keys(is_active, key_type);
```

#### 3.1.2 Migration from SQLite to PostgreSQL

**Strategy**: Dual-database approach during transition
- Keep SQLite for existing employee data initially
- Use PostgreSQL exclusively for chat feature
- Future: Migrate employee data to PostgreSQL

**Implementation Steps**:
1. Set up PostgreSQL connection in backend
2. Create schema and indexes
3. Implement connection pooling (pg-pool)
4. Add database adapter layer for future migration

### 3.2 API Design

#### 3.2.1 WebSocket Events

**Client → Server Events**

```javascript
// Connect with authentication
socket.emit('authenticate', {
    token: 'JWT_TOKEN'
});

// Send message
socket.emit('message:send', {
    conversationId: 'uuid',
    content: 'encrypted_content',
    contentType: 'text',
    replyToId: null, // optional
    metadata: {} // optional
});

// Typing indicator
socket.emit('typing:start', {
    conversationId: 'uuid'
});

socket.emit('typing:stop', {
    conversationId: 'uuid'
});

// Mark messages as read
socket.emit('message:read', {
    conversationId: 'uuid',
    messageIds: [1, 2, 3]
});

// Join conversation room
socket.emit('conversation:join', {
    conversationId: 'uuid'
});

// Leave conversation room
socket.emit('conversation:leave', {
    conversationId: 'uuid'
});

// Presence heartbeat
socket.emit('presence:heartbeat', {});
```

**Server → Client Events**

```javascript
// Authentication response
socket.on('authenticated', {
    userId: 123,
    sessionId: 'session_id'
});

socket.on('authentication:failed', {
    error: 'Invalid token'
});

// New message received
socket.on('message:new', {
    id: 12345,
    conversationId: 'uuid',
    senderId: 456,
    senderName: 'John Doe',
    content: 'encrypted_content',
    contentType: 'text',
    sentAt: '2026-02-12T10:30:00Z',
    replyTo: null,
    metadata: {}
});

// Message delivery status
socket.on('message:delivered', {
    messageId: 12345,
    recipientId: 789,
    deliveredAt: '2026-02-12T10:30:01Z'
});

socket.on('message:read', {
    messageId: 12345,
    recipientId: 789,
    readAt: '2026-02-12T10:30:05Z'
});

// Typing indicators
socket.on('typing:started', {
    conversationId: 'uuid',
    userId: 456,
    userName: 'John Doe'
});

socket.on('typing:stopped', {
    conversationId: 'uuid',
    userId: 456
});

// Presence updates
socket.on('presence:updated', {
    userId: 456,
    status: 'online', // online, away, offline
    lastSeen: '2026-02-12T10:30:00Z'
});

// Error events
socket.on('error', {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many messages sent'
});
```

#### 3.2.2 REST API Endpoints

**Conversation Management**

```
GET /api/chat/conversations
Description: List user's conversations
Query Params: page, limit, search
Response: {
    conversations: [
        {
            id: 'uuid',
            type: 'direct',
            participants: [...],
            lastMessage: {...},
            unreadCount: 5,
            updatedAt: '2026-02-12T10:30:00Z'
        }
    ],
    pagination: {...}
}

POST /api/chat/conversations
Description: Create new conversation
Body: {
    type: 'direct' | 'group',
    participantIds: [123, 456],
    name: 'Group Name' // for group chats
}
Response: { conversation: {...} }

GET /api/chat/conversations/:id
Description: Get conversation details
Response: { conversation: {...} }

DELETE /api/chat/conversations/:id/leave
Description: Leave a conversation
Response: { success: true }
```

**Message Management**

```
GET /api/chat/messages/:conversationId
Description: Get message history
Query Params: before (cursor), limit, search
Response: {
    messages: [...],
    hasMore: true,
    cursor: 'timestamp_or_id'
}

PUT /api/chat/messages/:id
Description: Edit message
Body: { content: 'encrypted_updated_content' }
Response: { message: {...} }

DELETE /api/chat/messages/:id
Description: Delete/soft-delete message
Response: { success: true }

POST /api/chat/messages/:id/react
Description: Add reaction to message
Body: { emoji: '👍' }
Response: { success: true }
```

**Search**

```
GET /api/chat/search
Description: Search messages (client-side search on decrypted content)
Note: Due to E2EE, this endpoint returns message metadata only.
      Actual content search happens client-side after decryption.
Query Params: conversationId (optional), before (timestamp), limit
Response: {
    messages: [...], // Encrypted messages with metadata
    total: 150
}
```

**Encryption Key Management**

```
POST /api/chat/keys/upload
Description: Upload encryption keys
Body: {
    identityKey: {...},
    signedPreKey: {...},
    oneTimePreKeys: [...]
}
Response: { success: true }

GET /api/chat/keys/:userId
Description: Get user's public keys for encryption
Response: {
    identityKey: {...},
    signedPreKey: {...},
    oneTimePreKey: {...}
}
```

### 3.3 End-to-End Encryption Architecture

#### 3.3.1 Protocol Selection: Signal Protocol

**Rationale**:
- Industry-standard E2EE protocol
- Forward secrecy and post-compromise security
- Well-audited and battle-tested
- JavaScript library available (libsignal-protocol-javascript)

#### 3.3.2 Key Management

**Key Types**:
1. **Identity Key Pair**: Long-term key, unique per user
2. **Signed Pre-Key**: Medium-term key, rotated monthly
3. **One-Time Pre-Keys**: Short-term keys, used once per session

**Key Generation Flow**:
```mermaid
sequenceDiagram
    participant U as User Device
    participant C as Client App
    participant S as Server
    participant DB as PostgreSQL
    
    U->>C: First login/key rotation
    C->>C: Generate Identity Key Pair
    C->>C: Generate Signed Pre-Key
    C->>C: Generate 100 One-Time Pre-Keys
    C->>S: POST /api/chat/keys/upload
    S->>DB: Store public keys only
    DB-->>S: Success
    S-->>C: Keys uploaded
    C->>C: Store private keys in IndexedDB
```

**Key Storage**:
- **Client**: Private keys in browser IndexedDB (encrypted with user password)
- **Server**: Public keys only in PostgreSQL
- **Backup**: Optional encrypted backup to server (user's choice)

#### 3.3.3 Message Encryption Flow

```mermaid
sequenceDiagram
    participant A as Alice (Sender)
    participant S as Server
    participant B as Bob (Recipient)
    
    A->>S: Request Bob's public keys
    S-->>A: Identity, Signed Pre-Key, One-Time Pre-Key
    A->>A: Establish session with Bob's keys
    A->>A: Encrypt message with session
    A->>S: Send encrypted message
    S->>S: Store encrypted message in DB
    S->>B: Push encrypted message (via WebSocket)
    B->>B: Decrypt using established session
    B-->>S: Acknowledge receipt
    S-->>A: Delivery confirmation
```

**Important Notes**:
- Server NEVER has access to plaintext messages
- Server only routes encrypted payloads
- Search operates on client-side decrypted data or encrypted metadata
- Group messages use sender keys for efficiency

### 3.4 Scalability Architecture

#### 3.4.1 Horizontal Scaling Strategy

**Target**: Support 10,000 concurrent users

**Scaling Approach**:

1. **WebSocket Server Instances**
   - Deploy 6 instances initially (~1,667 users per instance with headroom)
   - Auto-scaling based on connection count and CPU/memory
   - Each instance: 4 CPU cores, 8GB RAM
   - Formula: `instances = ceil(concurrent_users / 2000) + 20% overhead`

2. **Load Distribution**
   ```
   Concurrent Users: 10,000
   Average connections per instance: 2,000
   Required instances: 5
   
   With 20% overhead: 6 instances
   ```

3. **Redis Pub/Sub as Message Broker**
   - Enables communication between WebSocket server instances
   - Single Redis instance can handle 100K+ messages/sec
   - For 10K users with avg 10 messages/user/hour:
     - Peak: ~28 messages/sec
     - Well within Redis capacity

#### 3.4.2 Database Performance

**PostgreSQL Optimization**:

1. **Connection Pooling**
   - Pool size: 20 connections per app instance
   - Total: 120 connections (6 instances)
   - Max PostgreSQL connections: 200 (allows headroom)

2. **Partitioning Strategy**
   - Messages table partitioned by month
   - Automatic cleanup of old partitions (retention policy)
   - Query performance: O(log n) within partition

3. **Indexing Strategy**
   - B-tree indexes on foreign keys
   - GiST index for full-text search
   - Composite indexes for common queries
   - Expected query time: < 50ms for message fetch

4. **Write Performance**
   - Batch inserts for delivery tracking
   - Async writes with acknowledgment
   - Write capacity: 1,000 messages/sec

#### 3.4.3 Redis Architecture

**Two Redis Instances**:

1. **Redis Pub/Sub** (Message Broker)
   - Purpose: Inter-server communication
   - Configuration: Default persistence off (ephemeral)
   - Capacity: 100K ops/sec

2. **Redis Cache** (Data Cache)
   - Purpose: Presence, recent messages, sessions
   - Configuration: RDB + AOF persistence
   - Eviction policy: allkeys-lru
   - Memory: 4GB (can cache ~1M presence entries)
   - Capacity: 50K ops/sec

#### 3.4.4 Network Bandwidth

**Calculation**:
```
10,000 concurrent users
Average message size: 500 bytes (encrypted)
Average 10 messages/user/hour = 0.0028 messages/sec/user

Total message rate: 28 messages/sec
Bandwidth: 28 * 500 bytes * 2 (send + receive) = 28 KB/sec
Peak (10x): 280 KB/sec = 2.24 Mbps

With overhead: ~5 Mbps required
```

**Verdict**: Bandwidth is not a bottleneck

### 3.5 Security Considerations

#### 3.5.1 Authentication & Authorization

**WebSocket Authentication**:
```javascript
// Client sends JWT token on connection
socket.on('connect', () => {
    socket.emit('authenticate', { token: jwtToken });
});

// Server validates before allowing any operations
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    jwt.verify(token, SECRET, (err, decoded) => {
        if (err) return next(new Error('Authentication failed'));
        socket.userId = decoded.userId;
        next();
    });
});
```

**Authorization Checks**:
- Verify user belongs to conversation before allowing message send/receive
- Check permissions for group operations (add/remove participants)
- Rate limit per user (prevent spam)

#### 3.5.2 Rate Limiting

**Multi-Layer Rate Limiting**:

1. **Connection Level** (per WebSocket connection)
   - 30 messages per minute
   - 5 typing indicators per minute
   - Implementation: Token bucket algorithm

2. **API Level** (REST endpoints)
   - 100 requests per 15 minutes (existing)
   - Stricter limits for expensive operations (search: 10/min)

3. **User Level** (across all connections)
   - 100 messages per hour
   - Prevents abuse from multiple devices

**Implementation**:
```javascript
const rateLimiter = new Map(); // userId -> {count, resetTime}

function checkRateLimit(userId, limit, windowSec) {
    const now = Date.now();
    const userLimit = rateLimiter.get(userId) || { count: 0, resetTime: now };
    
    if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + (windowSec * 1000);
    }
    
    if (userLimit.count >= limit) {
        return false; // Rate limit exceeded
    }
    
    userLimit.count++;
    rateLimiter.set(userId, userLimit);
    return true;
}
```

#### 3.5.3 Input Validation & Sanitization

**Message Validation**:
- Max message size: 10KB (encrypted)
- Content type whitelist: text, file, image, system
- File upload validation (if implemented): Max 10MB, allowed types
- XSS protection: Client-side sanitization before rendering

**SQL Injection Prevention**:
- Parameterized queries only (pg library)
- No dynamic SQL construction
- Example:
  ```javascript
  // GOOD
  db.query('SELECT * FROM messages WHERE conversation_id = $1', [conversationId]);
  
  // BAD (never do this)
  db.query(`SELECT * FROM messages WHERE conversation_id = '${conversationId}'`);
  ```

#### 3.5.4 Transport Security

**TLS/SSL**:
- All WebSocket connections over WSS (WebSocket Secure)
- HTTPS for REST API
- TLS 1.3 minimum
- Strong cipher suites only

**Certificate Management**:
- Let's Encrypt for automatic certificate renewal
- HSTS header enabled
- Certificate pinning for mobile clients (future)

#### 3.5.5 Data Privacy & Compliance

**GDPR Compliance**:
- Right to access: Export all user messages
- Right to erasure: Hard delete messages on request
- Data minimization: Only store necessary metadata
- Purpose limitation: Messages only used for chat feature

**Audit Logging**:
- Log authentication events
- Log administrative actions
- Do NOT log message content (encrypted anyway)
- Retention: 90 days

### 3.6 Performance Requirements

#### 3.6.1 Latency Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Message delivery (same server) | < 50ms (p95) | WebSocket round-trip |
| Message delivery (different server) | < 100ms (p95) | Via Redis Pub/Sub |
| Message persistence | < 200ms (p95) | PostgreSQL write + ack |
| Message history fetch | < 500ms (p95) | 50 messages |
| Search query | < 1s (p95) | Across 1000 messages |
| Connection establishment | < 2s (p95) | Including auth |
| Reconnection time | < 5s (p95) | With exponential backoff |

#### 3.6.2 Throughput Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Messages per second | 1,000 | Across all servers |
| New connections per second | 100 | During peak |
| Concurrent WebSocket connections | 10,000 | Primary requirement |
| Database writes per second | 1,500 | Messages + delivery tracking |
| Database reads per second | 3,000 | History + search |
| Redis operations per second | 10,000 | Pub/Sub + cache |

#### 3.6.3 Resource Utilization Targets

**Per WebSocket Server Instance**:
- CPU: < 70% average, < 90% peak
- Memory: < 6GB of 8GB allocated
- Network: < 50Mbps per instance
- Open connections: 2,000 max

**PostgreSQL**:
- CPU: < 60% average
- Memory: 16GB allocated (8GB shared buffers)
- Disk I/O: < 500 IOPS
- Connection count: < 150 of 200 max

**Redis Instances**:
- Memory: < 80% of allocated (3.2GB of 4GB)
- CPU: < 30% average
- Network: < 100Mbps

### 3.7 Monitoring & Observability

#### 3.7.1 Key Metrics

**Application Metrics**:
- Active WebSocket connections per server
- Message send/receive rate
- Message delivery latency (p50, p95, p99)
- WebSocket reconnection rate
- Authentication success/failure rate
- Rate limit hit rate
- Error rate by type

**Infrastructure Metrics**:
- Server CPU, memory, network usage
- PostgreSQL query performance, connection pool usage
- Redis memory usage, eviction rate, command latency
- Load balancer connection distribution

**Business Metrics**:
- Daily/monthly active users
- Messages sent per user per day
- Average conversation response time
- Peak concurrent users
- User retention rate

#### 3.7.2 Logging Strategy

**Log Levels**:
- ERROR: Critical failures requiring immediate attention
- WARN: Degraded performance or recoverable errors
- INFO: Important state changes (connections, auth)
- DEBUG: Detailed flow for troubleshooting (dev only)

**Structured Logging**:
```javascript
logger.info('Message sent', {
    userId: 123,
    conversationId: 'uuid',
    messageId: 456,
    latency: 45,
    timestamp: new Date().toISOString()
});
```

**Log Aggregation**:
- Centralized logging (e.g., ELK stack, Datadog)
- Correlation IDs for tracing requests
- Log retention: 30 days

#### 3.7.3 Alerting

**Critical Alerts** (immediate response):
- Server down or unreachable
- Database connection failures
- Redis connection failures
- Error rate > 1%
- Average latency > 500ms

**Warning Alerts** (investigate within hours):
- CPU > 80% for 5 minutes
- Memory > 85%
- Connection count > 90% of capacity
- Rate limit hit rate > 10%

### 3.8 Deployment Strategy

#### 3.8.1 Environment Architecture

**Environments**:
1. **Development**: Local docker-compose setup
2. **Staging**: Mirrors production, 1/10 scale
3. **Production**: Full scale, multi-AZ deployment

#### 3.8.2 Infrastructure as Code

**Technology**: Docker + Docker Compose (simple) or Kubernetes (advanced)

**Docker Compose Setup** (for development/small-scale):

```yaml
version: '3.8'

services:
  # WebSocket server instances
  chat-server-1:
    build: ./backend-chat
    environment:
      - NODE_ENV=production
      - PORT=5001
      - REDIS_URL=redis://redis-pubsub:6379
      - REDIS_CACHE_URL=redis://redis-cache:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/chatdb
    depends_on:
      - postgres
      - redis-pubsub
      - redis-cache
    restart: always

  chat-server-2:
    build: ./backend-chat
    environment:
      - NODE_ENV=production
      - PORT=5002
      - REDIS_URL=redis://redis-pubsub:6379
      - REDIS_CACHE_URL=redis://redis-cache:6379
      - DATABASE_URL=postgresql://user:pass@postgres:5432/chatdb
    depends_on:
      - postgres
      - redis-pubsub
      - redis-cache
    restart: always

  # Load balancer
  nginx:
    image: nginx:latest
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "443:443"
      - "80:80"
    depends_on:
      - chat-server-1
      - chat-server-2
    restart: always

  # PostgreSQL
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=chatdb
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: always

  # Redis Pub/Sub
  redis-pubsub:
    image: redis:7-alpine
    restart: always

  # Redis Cache
  redis-cache:
    image: redis:7-alpine
    command: redis-server --maxmemory 4gb --maxmemory-policy allkeys-lru --appendonly yes
    volumes:
      - redis-cache-data:/data
    restart: always

volumes:
  postgres-data:
  redis-cache-data:
```

#### 3.8.3 Deployment Process

**CI/CD Pipeline**:

1. **Build Phase**:
   - Run unit tests
   - Run integration tests
   - Build Docker images
   - Tag images with version

2. **Deploy Phase**:
   - Deploy to staging
   - Run smoke tests
   - Manual approval gate
   - Deploy to production (rolling update)
   - Run post-deployment tests

**Rolling Update Strategy**:
- Update one server instance at a time
- Wait for health check to pass
- Monitor error rates
- Automatic rollback on failures

#### 3.8.4 Database Migrations

**Tool**: node-pg-migrate or Flyway

**Process**:
1. Write migration script (up + down)
2. Test on staging
3. Review migration plan
4. Apply during maintenance window (if needed)
5. Monitor performance post-migration

**Example Migration**:
```sql
-- Up migration
CREATE TABLE IF NOT EXISTS conversations (...);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- Down migration
DROP TABLE IF EXISTS conversations CASCADE;
```

### 3.9 Disaster Recovery & High Availability

#### 3.9.1 High Availability Architecture

**Database**:
- PostgreSQL primary with streaming replication
- Automatic failover with pg_auto_failover or Patroni
- RPO: < 1 minute (synchronous replication)
- RTO: < 5 minutes (automatic failover)

**Redis**:
- Redis Sentinel for automatic failover
- 3-node setup (1 master, 2 replicas)
- RPO: < 10 seconds
- RTO: < 30 seconds

**WebSocket Servers**:
- Multiple instances with auto-scaling
- Health checks every 10 seconds
- Automatic removal of unhealthy instances
- No SPOF (single point of failure)

#### 3.9.2 Backup Strategy

**PostgreSQL Backups**:
- Full backup: Daily at 2 AM UTC
- Incremental backup: Every 6 hours
- Point-in-time recovery (PITR): Last 7 days
- Retention: 30 days
- Storage: S3 or equivalent
- Encrypted at rest

**Redis Backups** (Cache instance only):
- RDB snapshot: Every 6 hours
- AOF persistence: Enabled
- Retention: 7 days

#### 3.9.3 Disaster Recovery Plan

**Scenarios & Response**:

1. **Single Server Failure**:
   - Automatic: Load balancer removes unhealthy instance
   - Clients reconnect to healthy instances
   - Impact: < 5 seconds reconnection time

2. **Database Failure**:
   - Automatic: Failover to replica (< 5 min)
   - Manual: Restore from backup if needed (< 1 hour)
   - Impact: Minimal, Redis cache reduces load

3. **Redis Failure**:
   - Automatic: Sentinel promotes replica (< 30 sec)
   - Impact: Brief disruption to real-time features
   - Fallback: Direct server-to-server communication

4. **Complete Data Center Failure**:
   - Manual: Failover to secondary region
   - Restore database from backup
   - Reconfigure DNS
   - Impact: 1-2 hours downtime
   - Note: Requires multi-region setup (future)

---

## 4. Trade-offs and Alternatives Considered

### 4.1 WebSocket vs. Long Polling vs. Server-Sent Events

**Decision**: WebSocket

**Alternatives Considered**:

| Technology | Pros | Cons | Decision |
|------------|------|------|----------|
| **WebSocket** | ✅ Bidirectional<br>✅ Low latency<br>✅ Efficient | ❌ More complex<br>❌ Firewall issues (rare) | **CHOSEN** |
| Long Polling | ✅ Simple<br>✅ Broad support | ❌ High latency<br>❌ Server overhead | Rejected |
| Server-Sent Events | ✅ Simple<br>✅ Auto-reconnect | ❌ One-way only<br>❌ HTTP/1.1 limits | Rejected |

**Rationale**: WebSocket provides the best user experience for real-time chat with low latency and efficient bidirectional communication.

### 4.2 PostgreSQL vs. MongoDB vs. Cassandra

**Decision**: PostgreSQL

**Alternatives Considered**:

| Database | Pros | Cons | Decision |
|----------|------|------|----------|
| **PostgreSQL** | ✅ ACID compliance<br>✅ Reliable<br>✅ Full-text search<br>✅ Team familiarity | ❌ Harder horizontal scaling | **CHOSEN** |
| MongoDB | ✅ Schema flexibility<br>✅ Horizontal scaling | ❌ Eventual consistency<br>❌ Complex aggregations | Rejected |
| Cassandra | ✅ Massive scale<br>✅ Write performance | ❌ Overkill for 10K users<br>❌ Complex operations | Rejected |

**Rationale**: PostgreSQL offers the best balance of reliability, features, and simplicity for our scale. ACID guarantees ensure message integrity. Can scale to millions of messages with partitioning.

### 4.3 Signal Protocol vs. Custom Encryption vs. No E2EE

**Decision**: Signal Protocol

**Alternatives Considered**:

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| **Signal Protocol** | ✅ Battle-tested<br>✅ Forward secrecy<br>✅ Industry standard | ❌ Complex implementation<br>❌ Key management | **CHOSEN** |
| Custom AES | ✅ Simpler<br>✅ Faster | ❌ No forward secrecy<br>❌ Security risks | Rejected |
| No E2EE | ✅ Simplest<br>✅ Full-text search | ❌ Security risk<br>❌ Compliance issues | Rejected |

**Rationale**: Security is critical for business communications. Signal Protocol is proven and provides the best security guarantees. Complexity is worth the security benefits.

### 4.4 Socket.io vs. Native WebSocket vs. ws Library

**Decision**: Socket.io

**Alternatives Considered**:

| Library | Pros | Cons | Decision |
|---------|------|------|----------|
| **Socket.io** | ✅ Auto-reconnect<br>✅ Room support<br>✅ Fallback to polling<br>✅ Redis adapter | ❌ Larger bundle<br>❌ Custom protocol | **CHOSEN** |
| Native WebSocket | ✅ Lightweight<br>✅ Standard | ❌ No auto-reconnect<br>❌ Manual room management | Rejected |
| ws Library | ✅ Fast<br>✅ Lightweight | ❌ Less features<br>❌ More code | Rejected |

**Rationale**: Socket.io provides essential features (auto-reconnect, rooms, Redis adapter) out of the box, reducing development time and potential bugs.

### 4.5 Microservices vs. Monolithic Chat Service

**Decision**: Monolithic Chat Service

**Alternatives Considered**:

| Architecture | Pros | Cons | Decision |
|--------------|------|------|----------|
| **Monolithic** | ✅ Simpler deployment<br>✅ Lower latency<br>✅ Easier debugging | ❌ Less granular scaling | **CHOSEN** |
| Microservices | ✅ Independent scaling<br>✅ Technology flexibility | ❌ Network overhead<br>❌ Distributed tracing | Rejected |

**Rationale**: At 10K concurrent users, a monolithic chat service is simpler and sufficient. Can migrate to microservices if we exceed 50K users.

---

## 5. Implementation Phases

### Phase 1: Foundation (Weeks 1-3)
**Goal**: Basic infrastructure and database setup

- [ ] Set up PostgreSQL database
- [ ] Create database schema and migrations
- [ ] Set up Redis instances (Pub/Sub + Cache)
- [ ] Implement database adapter layer
- [ ] Set up development environment with Docker Compose
- [ ] Create basic WebSocket server with Socket.io
- [ ] Implement authentication middleware

**Deliverables**:
- Running PostgreSQL with schema
- WebSocket server accepting authenticated connections
- Development environment setup guide

### Phase 2: Core Chat Functionality (Weeks 4-6)
**Goal**: Implement basic chat without encryption

- [ ] Implement message send/receive via WebSocket
- [ ] Implement message persistence to PostgreSQL
- [ ] Implement Redis Pub/Sub for multi-server messaging
- [ ] Create REST API for message history
- [ ] Build basic React chat UI components
- [ ] Implement conversation management
- [ ] Add typing indicators
- [ ] Add presence tracking

**Deliverables**:
- Working chat with multiple conversations
- Message history persistence and retrieval
- Basic UI for sending/receiving messages

### Phase 3: End-to-End Encryption (Weeks 7-9)
**Goal**: Add E2EE using Signal Protocol

- [ ] Integrate libsignal-protocol-javascript
- [ ] Implement key generation and storage
- [ ] Create key management API endpoints
- [ ] Implement encryption/decryption in client
- [ ] Add key exchange flow
- [ ] Update message flow to use encryption
- [ ] Test cross-device encryption

**Deliverables**:
- E2EE working for all messages
- Key management system
- Encrypted message storage

### Phase 4: Performance & Scalability (Weeks 10-11)
**Goal**: Optimize for 10K concurrent users

- [ ] Implement connection pooling
- [ ] Add database query optimization
- [ ] Implement caching strategies
- [ ] Add horizontal scaling support
- [ ] Load test with 10K concurrent connections
- [ ] Optimize bundle sizes
- [ ] Implement lazy loading for message history

**Deliverables**:
- System handling 10K concurrent users
- Performance metrics meeting targets
- Load test results

### Phase 5: Enhanced Features (Weeks 12-13)
**Goal**: Polish and additional features

- [ ] Implement message search
- [ ] Add message reactions
- [ ] Add file upload support
- [ ] Implement read receipts
- [ ] Add push notifications
- [ ] Implement message threading
- [ ] Add user preferences (notifications, muted conversations)

**Deliverables**:
- Feature-complete chat system
- User-friendly interface
- Documentation

### Phase 6: Production Readiness (Weeks 14-15)
**Goal**: Prepare for production deployment

- [ ] Set up monitoring and alerting
- [ ] Implement comprehensive logging
- [ ] Create deployment scripts
- [ ] Set up CI/CD pipeline
- [ ] Perform security audit
- [ ] Create runbooks for operations
- [ ] Conduct penetration testing
- [ ] Write user documentation

**Deliverables**:
- Production-ready system
- Operational runbooks
- Security audit report
- User documentation

---

## 6. Success Metrics

### 6.1 Technical Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Scalability** | Support 10,000 concurrent users | Load testing, production monitoring |
| **Latency** | p95 message delivery < 100ms | Application performance monitoring (APM) |
| **Uptime** | 99.9% availability | Uptime monitoring service |
| **Error Rate** | < 0.1% | Error tracking, logging |
| **Message Delivery** | 99.99% delivery rate | Message tracking in database |
| **Reconnection Success** | > 95% auto-reconnect | Client metrics |

### 6.2 Business Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **User Adoption** | 70% of employees using chat within 3 months | Usage analytics |
| **Daily Active Users** | 60% of total users | Analytics dashboard |
| **Messages per User** | Average 20 messages/day | Database analytics |
| **Response Time** | Median response time < 5 minutes | Message timestamp analysis |
| **User Satisfaction** | NPS > 50 | User surveys |
| **Support Tickets** | < 5% of users reporting issues | Support system |

### 6.3 Security Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Encryption Coverage** | 100% of messages E2EE | Code enforcement |
| **Security Incidents** | Zero breaches | Security monitoring |
| **Authentication Failure Rate** | < 1% | Auth logs |
| **Rate Limit Hit Rate** | < 5% of requests | Rate limiter logs |
| **Vulnerability Scan** | Zero high/critical vulnerabilities | Automated scanning |

---

## 7. Risks and Mitigation

### 7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **E2EE complexity delays project** | High | High | Start E2EE early, allocate extra time, consider phased rollout without E2EE first |
| **PostgreSQL doesn't scale** | Low | High | Implement partitioning, monitoring, ready migration path to Cassandra |
| **WebSocket connection issues** | Medium | Medium | Implement robust reconnection logic, fallback to polling |
| **Key management complexity** | Medium | High | Use proven libraries, extensive testing, backup/recovery procedures |
| **Performance degradation under load** | Medium | High | Load testing early, performance monitoring, auto-scaling |

### 7.2 Security Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Key compromise** | Low | Critical | Key rotation policy, secure key storage, forward secrecy |
| **Message interception** | Low | High | TLS for all connections, certificate pinning |
| **DDoS attack** | Medium | Medium | Rate limiting, auto-scaling, DDoS protection service |
| **SQL injection** | Low | High | Parameterized queries only, code review, automated scanning |
| **XSS attacks** | Medium | Medium | Input sanitization, Content Security Policy, React's built-in XSS protection |

### 7.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Database failure** | Low | Critical | Replication, automated failover, regular backups, tested recovery |
| **Redis failure** | Medium | Medium | Sentinel for auto-failover, graceful degradation |
| **Deployment failures** | Medium | High | Automated testing, staged rollout, automatic rollback |
| **Monitoring gaps** | Medium | Medium | Comprehensive monitoring setup, regular review, alerts testing |
| **Team knowledge gaps** | High | Medium | Training, documentation, pair programming, code review |

---

## 8. Future Enhancements

### 8.1 Short-term (3-6 months)

- **Voice/Video Calling**: Integrate WebRTC for real-time calls
- **Message Forwarding**: Share messages across conversations
- **Pinned Messages**: Pin important messages in conversations
- **Custom Emojis/Reactions**: Organization-specific reactions
- **Advanced Search**: Search by date range, sender, attachments
- **Message Export**: Export conversation history

### 8.2 Medium-term (6-12 months)

- **Bot Integration**: Chatbots for automated responses
- **API for External Integrations**: Allow third-party integrations
- **Mobile Apps**: Native iOS and Android applications
- **Desktop Apps**: Electron-based desktop clients
- **Multi-language Support**: Internationalization
- **Analytics Dashboard**: Usage analytics for admins

### 8.3 Long-term (12+ months)

- **AI-powered Features**: Smart replies, message summarization
- **Video Conferencing**: Built-in video meetings
- **Screen Sharing**: Share screens during conversations
- **Advanced Admin Controls**: Content moderation, compliance tools
- **Federation**: Connect with other chat systems
- **Blockchain-based Verification**: Message authenticity verification

---

## 9. Appendices

### 9.1 Technology Stack Summary

**Frontend**:
- React 19.x
- Socket.io-client 4.x
- libsignal-protocol-javascript
- IndexedDB for local storage
- Material-UI or Ant Design for UI components

**Backend**:
- Node.js 18+ LTS
- Express.js 5.x
- Socket.io 4.x
- PostgreSQL 15+
- Redis 7+
- node-postgres (pg) for database
- ioredis for Redis client
- jsonwebtoken for JWT

**Infrastructure**:
- Docker & Docker Compose
- Nginx or HAProxy
- Let's Encrypt for SSL
- AWS/GCP/Azure for cloud hosting

**DevOps**:
- GitHub Actions for CI/CD
- Prometheus + Grafana for monitoring
- ELK Stack or Datadog for logging
- Artillery or k6 for load testing

### 9.2 Glossary

- **E2EE**: End-to-End Encryption - Encryption where only communicating users can read messages
- **Signal Protocol**: Industry-standard cryptographic protocol for secure messaging
- **WebSocket**: Protocol providing full-duplex communication over a single TCP connection
- **Pub/Sub**: Publish-Subscribe messaging pattern
- **ACID**: Atomicity, Consistency, Isolation, Durability - database transaction properties
- **RPO**: Recovery Point Objective - maximum acceptable data loss
- **RTO**: Recovery Time Objective - maximum acceptable downtime
- **p95**: 95th percentile - 95% of requests complete within this time
- **Forward Secrecy**: Property where past communications remain secure if keys are compromised

### 9.3 References

1. Signal Protocol Documentation: https://signal.org/docs/
2. Socket.io Documentation: https://socket.io/docs/
3. PostgreSQL Performance Tuning: https://wiki.postgresql.org/wiki/Performance_Optimization
4. WebSocket Protocol RFC 6455: https://tools.ietf.org/html/rfc6455
5. OWASP Top 10 Security Risks: https://owasp.org/www-project-top-ten/

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-12 | Technical Design Team | Initial document creation |

---

**Document Status**: Draft - Ready for Review

**Next Steps**:
1. Technical review by development team
2. Security review by security team
3. Architecture review by senior architects
4. Stakeholder approval
5. Begin Phase 1 implementation

