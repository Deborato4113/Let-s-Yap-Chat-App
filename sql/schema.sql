-- Let's Yap — MySQL schema (works on AWS RDS MySQL / Aurora MySQL)

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NULL,              -- NULL for Firebase-only accounts (Google / Firebase email)
  firebase_uid VARCHAR(128) NULL UNIQUE,   -- set when the account signed in via Firebase Auth
  name VARCHAR(40) NOT NULL,
  bio VARCHAR(140) NOT NULL DEFAULT 'Hey there! I am using Let''s Yap.',
  avatar_color VARCHAR(20) NOT NULL DEFAULT '',
  avatar_url LONGTEXT NULL,               -- base64 profile photo, same pattern as message attachments
  theme VARCHAR(20) NOT NULL DEFAULT 'classic',   -- accent color preset
  dark_mode TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('online', 'away', 'offline') NOT NULL DEFAULT 'offline',
  is_bot TINYINT(1) NOT NULL DEFAULT 0,    -- the built-in "Yap AI" assistant user
  last_seen DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- who has blocked whom (blocked users can't message each other)
CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_id INT NOT NULL,
  blocked_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (blocker_id, blocked_id),
  FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  is_group TINYINT(1) NOT NULL DEFAULT 0,
  group_name VARCHAR(60) NOT NULL DEFAULT '',
  group_avatar_color VARCHAR(20) NOT NULL DEFAULT '#00A884',
  created_by INT NULL,
  last_message_text TEXT NULL,
  last_message_type VARCHAR(10) NOT NULL DEFAULT 'text',
  last_message_sender_id INT NULL,
  last_message_timestamp DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (last_message_sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  UNIQUE KEY uniq_conversation_user (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'text',
  text TEXT NOT NULL DEFAULT '',
  file_name VARCHAR(255) NOT NULL DEFAULT '',
  file_data LONGTEXT NULL,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_for_everyone TINYINT(1) NOT NULL DEFAULT 0,
  reply_to_id INT NULL,                    -- quoted message, if this is a reply
  pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
  INDEX idx_conversation_timestamp (conversation_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- one emoji reaction per user per message (re-reacting replaces it, like WhatsApp)
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- per-user starred messages (private - not visible to the other participant)
CREATE TABLE IF NOT EXISTS message_stars (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- who has read a message (mirrors the old Mongo `readBy` array)
CREATE TABLE IF NOT EXISTS message_reads (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- who the message has been delivered to (mirrors the old `deliveredTo` array)
CREATE TABLE IF NOT EXISTS message_deliveries (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "delete for me" per user (mirrors the old `deletedFor` array)
CREATE TABLE IF NOT EXISTS message_deleted_for (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- per-user, per-conversation settings: mute notifications and "clear chat"
-- (clearing just hides everything before the given time for that user, like
-- WhatsApp - it doesn't delete anything for the other participant)
CREATE TABLE IF NOT EXISTS conversation_settings (
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  muted TINYINT(1) NOT NULL DEFAULT 0,
  cleared_before DATETIME(3) NULL,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
