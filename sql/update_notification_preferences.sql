-- 기존 컬럼이 있는 경우 기본값 업데이트 (NULL인 경우만)
UPDATE users 
SET notification_preferences = '{
  "follow": true,
  "followee_post": true,
  "post_liked": true,
  "comment_liked": true,
  "post_commented": true,
  "mention_comment": true
}'::jsonb 
WHERE notification_preferences IS NULL;

-- 기존 데이터가 있는 사용자들의 알림 설정 업데이트 (새로운 필드 추가)
UPDATE users 
SET notification_preferences = notification_preferences || '{
  "followee_post": true,
  "post_liked": true,
  "comment_liked": true,
  "post_commented": true,
  "mention_comment": true
}'::jsonb
WHERE notification_preferences IS NOT NULL
  AND (
    notification_preferences->'followee_post' IS NULL OR
    notification_preferences->'post_liked' IS NULL OR
    notification_preferences->'comment_liked' IS NULL OR
    notification_preferences->'post_commented' IS NULL OR
    notification_preferences->'mention_comment' IS NULL
  );

-- 기존 컬럼의 기본값 변경
ALTER TABLE users ALTER COLUMN notification_preferences SET DEFAULT '{
  "follow": true,
  "followee_post": true,
  "post_liked": true,
  "comment_liked": true,
  "post_commented": true,
  "mention_comment": true
}'::jsonb;

-- 컬럼에 코멘트 추가
COMMENT ON COLUMN users.notification_preferences IS '사용자 알림 설정 (JSON 형태)
- follow: 팔로우 알림 (누군가 나를 팔로우함)
- followee_post: 팔로잉 게시물 알림 (팔로우한 사람의 새 게시물)
- post_liked: 게시물 좋아요 알림 (내 게시물에 좋아요)
- comment_liked: 댓글 좋아요 알림 (내 댓글에 좋아요)
- post_commented: 게시물 댓글 알림 (내 게시물에 댓글)
- mention_comment: 멘션 알림 (댓글에서 멘션됨)';

-- JSONB 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_notification_preferences ON users USING GIN (notification_preferences);
