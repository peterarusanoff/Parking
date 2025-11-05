# RBAC Architecture Visualization

## System Overview

```mermaid
graph TB
    subgraph "User Roles"
        U[User<br/>Regular Customer]
        GA[Garage Admin<br/>Manages Garages]
        SA[Super Admin<br/>Full Access]
    end

    subgraph "Database"
        UT[users table<br/>+role column]
        GAT[garage_admins table<br/>user_id + garage_id]
        GT[garages table]
    end

    subgraph "API Endpoints"
        PUB[Public Endpoints<br/>/api/users<br/>/api/passes]
        ADMIN[Admin Endpoints<br/>/api/admin/*]
    end

    U -->|can access| PUB
    GA -->|can access| PUB
    GA -->|can access| ADMIN
    SA -->|can access| PUB
    SA -->|full access| ADMIN

    GA -.->|assigned to| GAT
    GAT -.->|links to| GT
    SA -.->|manages all| GT

    style U fill:#e3f2fd
    style GA fill:#fff3e0
    style SA fill:#ffebee
    style ADMIN fill:#f3e5f5
```

## Access Control Flow

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant M as Auth Middleware
    participant D as Database
    
    U->>A: GET /api/admin/garages/:id/dashboard
    Note over U,A: Header: x-user-id
    
    A->>M: getCurrentUser()
    M->>D: SELECT user WHERE id = ?
    D-->>M: User object (role: garage_admin)
    
    M->>M: hasRole(['garage_admin', 'super_admin'])
    Note over M: ✅ User has required role
    
    M->>M: isGarageAdmin(userId, garageId)
    M->>D: Check garage_admins table
    D-->>M: ✅ Admin of this garage
    
    M-->>A: Authorized ✅
    A->>D: Query garage metrics
    D-->>A: Dashboard data
    A-->>U: 200 Success + JSON
```

## Permission Matrix

| Endpoint | User | Garage Admin | Super Admin |
|----------|------|--------------|-------------|
| `GET /api/users` | ❌ | ❌ | ✅ |
| `GET /api/users/:id` (own) | ✅ | ✅ | ✅ |
| `GET /api/users/:id` (any) | ❌ | ❌ | ✅ |
| `GET /api/passes` | ✅ | ✅ | ✅ |
| `POST /api/billing/subscribe` | ✅ | ✅ | ✅ |
| `GET /api/admin/my-garages` | ❌ | ✅ | ✅ |
| `GET /api/admin/garages/:id/dashboard` | ❌ | ✅* | ✅ |
| `GET /api/admin/garages/:id/reports/pl` | ❌ | ✅* | ✅ |
| `POST /api/admin/garage-admins` | ❌ | ❌ | ✅ |

\* Only for garages they manage

## Database Schema

```mermaid
erDiagram
    USERS ||--o{ GARAGE_ADMINS : "can be assigned as"
    GARAGES ||--o{ GARAGE_ADMINS : "has admins"
    USERS {
        uuid id PK
        string email UK
        user_role role "NEW: user|garage_admin|super_admin"
        timestamp created_at
    }
    GARAGE_ADMINS {
        uuid id PK
        uuid user_id FK
        uuid garage_id FK
        uuid assigned_by FK
        jsonb permissions
        timestamp assigned_at
    }
    GARAGES {
        uuid id PK
        string name
        string address
        boolean active
    }
```

## Role Hierarchy

```mermaid
graph TD
    SA[Super Admin] -->|full system access| ALL[All Garages]
    SA -->|can assign/revoke| GA
    
    GA[Garage Admin] -->|limited access| ASSIGNED[Assigned Garages Only]
    GA -->|can view reports| REPORTS[Reports & Dashboards]
    
    U[User] -->|customer access| OWN[Own Subscriptions]
    U -->|cannot access| REPORTS
    
    style SA fill:#ff6b6b
    style GA fill:#ffd93d
    style U fill:#6bcf7f
    style REPORTS fill:#a29bfe
```

## Multi-Garage Admin Example

```mermaid
graph LR
    subgraph "Jane - Garage Admin"
        J[Jane Smith<br/>Role: garage_admin]
    end
    
    subgraph "Assigned Garages"
        G1[Downtown Parking<br/>ID: abc-123]
        G2[Midtown Parking<br/>ID: def-456]
        G3[Uptown Parking<br/>ID: ghi-789]
    end
    
    subgraph "Other Garages"
        G4[Airport Parking<br/>ID: jkl-012<br/>❌ No Access]
    end
    
    J -->|✅ Can manage| G1
    J -->|✅ Can manage| G2
    J -->|✅ Can manage| G3
    J -.->|❌ Forbidden| G4
    
    style J fill:#ffd93d
    style G1 fill:#6bcf7f
    style G2 fill:#6bcf7f
    style G3 fill:#6bcf7f
    style G4 fill:#ff6b6b
```

## API Authorization Logic

```typescript
// 1. Authenticate user
const user = await getCurrentUser(context);
if (!user) {
  return unauthorizedResponse(); // 401
}

// 2. Check role requirement
if (!hasRole(user.role, ['garage_admin', 'super_admin'])) {
  return forbiddenResponse(); // 403
}

// 3. Check garage access (for garage-specific endpoints)
const canManage = await isGarageAdmin(user.id, garageId);
if (!canManage) {
  return forbiddenResponse('No access to this garage'); // 403
}

// 4. Execute request
const data = await getGarageDashboard(garageId);
return successResponse(data); // 200
```

## Middleware Stack

```mermaid
graph LR
    REQ[HTTP Request] --> CORS[CORS Middleware]
    CORS --> AUTH[Auth Middleware<br/>getCurrentUser]
    AUTH --> ROLE[Role Check<br/>hasRole]
    ROLE --> GARAGE[Garage Access<br/>isGarageAdmin]
    GARAGE --> HANDLER[Route Handler]
    HANDLER --> RES[HTTP Response]
    
    AUTH -.->|401| ERR[Error Response]
    ROLE -.->|403| ERR
    GARAGE -.->|403| ERR
    HANDLER -.->|500| ERR
    
    style AUTH fill:#a29bfe
    style ROLE fill:#fdcb6e
    style GARAGE fill:#e17055
    style ERR fill:#d63031
```

## Real-World Usage Scenario

```mermaid
sequenceDiagram
    participant SA as Super Admin<br/>(Bob)
    participant API
    participant DB
    participant GA as Garage Admin<br/>(Jane)
    participant C as Customer<br/>(John)
    
    Note over SA,C: Setup Phase
    SA->>API: POST /api/admin/garage-admins
    Note over SA,API: Assign Jane to Downtown Parking
    API->>DB: INSERT garage_admins
    DB-->>API: ✅ Assignment created
    
    Note over SA,C: Reporting Phase
    GA->>API: GET /api/admin/my-garages
    API->>DB: get_managed_garages(jane_id)
    DB-->>API: [Downtown Parking]
    API-->>GA: ✅ Your garages
    
    GA->>API: GET /admin/garages/downtown/dashboard
    API->>DB: is_garage_admin(jane_id, downtown_id)
    DB-->>API: ✅ true
    API->>DB: Query metrics
    DB-->>API: Dashboard data
    API-->>GA: ✅ 200 + JSON
    
    Note over SA,C: Customer Access
    C->>API: GET /admin/garages/downtown/dashboard
    Note over C,API: No x-user-id or wrong role
    API-->>C: ❌ 401 Unauthorized
```

## Benefits Summary

```mermaid
mindmap
  root((RBAC System))
    Security
      Least Privilege
      Data Isolation
      Audit Trail
    Scalability
      Multiple Admins
      Multi-Garage Support
      Delegated Management
    Flexibility
      Custom Permissions
      Role Upgrades
      Easy Assignment
    Type Safety
      TypeScript Types
      DB Constraints
      Compile-time Checks
```

## Migration Impact

```mermaid
graph TB
    subgraph "Before RBAC"
        B1[All users same role]
        B2[No access control]
        B3[Manual garage filtering]
    end
    
    subgraph "After RBAC"
        A1[3 distinct roles]
        A2[Automated access control]
        A3[Database-enforced permissions]
        A4[New admin endpoints]
    end
    
    B1 -->|Migration| A1
    B2 -->|Migration| A2
    B3 -->|Migration| A3
    B3 -->|Migration| A4
    
    style A1 fill:#6bcf7f
    style A2 fill:#6bcf7f
    style A3 fill:#6bcf7f
    style A4 fill:#6bcf7f
    style B1 fill:#ff6b6b
    style B2 fill:#ff6b6b
    style B3 fill:#ff6b6b
```

