-- 상호 팔로우 표시 설정 컬럼 추가
ALTER TABLE users ADD COLUMN show_mutual_follow BOOLEAN DEFAULT true;

-- 컬럼에 코멘트 추가
COMMENT ON COLUMN users.show_mutual_follow IS '상호 팔로우 관계 표시 여부 (true: 표시, false: 숨김)';
