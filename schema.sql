CREATE DATABASE IF NOT EXISTS findit_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE findit_db;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  report_type ENUM('lost', 'found') NOT NULL,
  title VARCHAR(150) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(180) NOT NULL,
  item_date DATE NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  image_url VARCHAR(2048) NULL,
  status ENUM('open', 'matched', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_items_type_status (report_type, status),
  INDEX idx_items_category (category),
  INDEX idx_items_date (item_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS item_matches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lost_item_id BIGINT UNSIGNED NOT NULL,
  found_item_id BIGINT UNSIGNED NOT NULL,
  initiated_by BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'accepted', 'dismissed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_pair (lost_item_id, found_item_id),
  CONSTRAINT fk_matches_lost FOREIGN KEY (lost_item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_found FOREIGN KEY (found_item_id) REFERENCES items(id) ON DELETE CASCADE,
  CONSTRAINT fk_matches_initiator FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;