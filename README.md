# Let's Yap

A full-stack, WhatsApp-style real-time chat app — **entirely in Next.js**,
backed by **MySQL on AWS**.

- **Everything:** Next.js (App Router) — pages, REST API (Route Handlers), and
  a custom server that attaches Socket.io for real-time messaging.
- **Database:** MySQL (via `mysql2`), designed to run on **Amazon RDS for MySQL**
  (or Aurora MySQL) — plain SQL, no ORM.
- **Auth:** JWT (username/email + password)

There is only **one app** here — one `npm install`, one dev server, one port.

## How it fits together

```
app/
  login/, register/, chat/     ← pages (React, client components)
  api/
    auth/register, auth/login, auth/me
    users, users/me
    conversations, conversations/dm, conversations/group
    conversations/[id]/messages
                                ← REST API, as Next.js Route Handlers
components/                    ← UI (Sidebar, ChatWindow, MessageBubble, ...)
lib/
  db.js                        ← mysql2 connection pool (cached)
  jwt.js, authServer.js        ← JWT sign/verify + request auth helper
  conversations.js, messages.js← shared SQL query/serialization helpers
  socketServer.js              ← Socket.io event handlers (messages, typing,
                                  presence, read receipts)
  api.js, socket.js            ← client-side API/socket helpers
  loadEnv.js                   ← loads .env.local before server.js/scripts run
sql/schema.sql                 ← table definitions (run once against your DB)
scripts/init-db.mjs            ← runs sql/schema.sql for you (npm run db:setup)
server.js                      ← custom server: boots Next + attaches Socket.io
```

## 1. Create a MySQL database on AWS

**Amazon RDS for MySQL** (the standard choice):

1. AWS Console → RDS → **Create database**.
2. Engine: **MySQL** (8.0). Templates: Free tier is fine for development.
3. Set a master username/password, DB instance identifier.
4. Under **Connectivity**: set "Public access" to **Yes** if you're connecting
   from your own machine (not from inside a VPC/EC2). If you keep it private,
   you'll need a VPN/bastion/EC2 inside the same VPC to reach it.
5. Under the RDS instance's **VPC security group**, add an inbound rule:
   Type "MySQL/Aurora", port **3306**, source = your IP (or `0.0.0.0/0` only
   for quick testing — lock this down for anything real).
6. Once it's "Available", copy the **endpoint** (looks like
   `lets-yap-db.xxxxxxxx.us-east-1.rds.amazonaws.com`).
7. Create the actual database inside the instance (RDS gives you a MySQL
   server, not a database) — either via a MySQL client:
   ```bash
   mysql -h <endpoint> -u <master-username> -p -e "CREATE DATABASE lets_yap;"
   ```
   or via any GUI tool (MySQL Workbench, TablePlus, DBeaver).

## 2. Configure environment variables

Edit `.env.local`:

```
DATABASE_URL=mysql://<username>:<password>@<endpoint>:3306/lets_yap
JWT_SECRET=<a long random string>
PORT=3000
```

## 3. Create the tables

```bash
npm install
npm run db:setup
```

This runs `sql/schema.sql` against `DATABASE_URL` and creates all 7 tables
(`users`, `conversations`, `conversation_participants`, `messages`,
`message_reads`, `message_deliveries`, `message_deleted_for`).

## 4. Run it

```bash
npm run dev
```

Open `http://localhost:3000`, register a couple of accounts (e.g. in two
browser windows/incognito tabs), and start chatting — use the "new chat" icon
in the sidebar to search for the other username.

For production:

```bash
npm run build
npm start
```

## Features

- Register / login with username or email
- 1:1 direct messages and group chats
- Real-time messaging via Socket.io
- Typing indicators
- Online / offline presence with "last seen"
- Read receipts (sent / delivered / read ticks, WhatsApp-style)
- Image/file sharing (small attachments)
- Delete message for me / for everyone
- Editable profile (name, about, avatar color)
- Responsive UI (mobile + desktop), WhatsApp Web-inspired layout

## Notes

- Attachments are capped at 5MB and stored as base64 in a `LONGTEXT` column —
  fine for a demo/project; for production, swap this for S3 + a URL column.
- `JWT_SECRET` should be a long random string in any real deployment.
- This app needs a long-lived Node process for the WebSocket connection, so it
  runs on a regular host (your machine, a VPS, EC2, etc.) — not deployable to
  pure-serverless platforms like Vercel as-is.
- The "read by" / "delivered to" / "deleted for me" per-user lists are
  implemented as small join tables (`message_reads`, `message_deliveries`,
  `message_deleted_for`) rather than JSON arrays, so they stay indexable and
  easy to query with plain SQL.
