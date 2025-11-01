-- Migration: Restructure tbl_home_pages with proper naming conventions
-- This migration renames columns to follow consistent naming pattern

-- Step 1: Rename existing columns to new naming convention
ALTER TABLE `tbl_home_pages`
  -- Hero Section (Slider Banner)
  CHANGE COLUMN `welcome_description` `hero_section_title` VARCHAR(255) NOT NULL,
  ADD COLUMN `hero_section_content` TEXT NOT NULL AFTER `hero_section_title`,
  ADD COLUMN `hero_banner_image_url` VARCHAR(255) NULL AFTER `hero_section_content`,
  
  -- Welcome Section
  CHANGE COLUMN `introduction_content` `welcome_section_title` VARCHAR(255) NOT NULL,
  ADD COLUMN `welcome_section_content` TEXT NOT NULL AFTER `welcome_section_title`,
  CHANGE COLUMN `introduction_image_url` `welcome_section_image_url` VARCHAR(255) NULL,
  
  -- About NHT Global Section
  CHANGE COLUMN `about_company_title` `about_section_title` VARCHAR(255) NOT NULL,
  CHANGE COLUMN `about_company_content_1` `about_section_content` TEXT NOT NULL,
  DROP COLUMN `about_company_content_2`,
  CHANGE COLUMN `about_company_image_url` `about_section_image_url` VARCHAR(255) NULL,
  
  -- History of NHT Global Section
  CHANGE COLUMN `why_network_marketing_title` `history_section_title` VARCHAR(255) NOT NULL DEFAULT 'History of NHT Global',
  CHANGE COLUMN `why_network_marketing_content` `history_section_content` TEXT NOT NULL,
  ADD COLUMN `history_section_image_url` VARCHAR(255) NULL AFTER `history_section_content`,
  
  -- Video Section
  CHANGE COLUMN `opportunity_video_header_title` `video_section_title` VARCHAR(255) NOT NULL,
  CHANGE COLUMN `opportunity_video_url` `video_section_youtube_url` VARCHAR(255) NULL,
  ADD COLUMN `video_section_file_url` VARCHAR(255) NULL AFTER `video_section_youtube_url`,
  
  -- How Get Dream Life Can Help Section
  CHANGE COLUMN `support_content` `help_section_title` VARCHAR(255) NOT NULL,
  ADD COLUMN `help_section_content` TEXT NOT NULL AFTER `help_section_title`,
  ADD COLUMN `help_section_image_url` VARCHAR(255) NULL AFTER `help_section_content`;

-- Note: Run this migration carefully and backup your data first!
-- You may need to adjust based on existing data in your table

-- Optional: View the new structure
-- DESCRIBE tbl_home_pages;