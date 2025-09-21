-- 채팅 시스템 테이블 구조 개선 마이그레이션
-- 실행 순서대로 작성됨

-- 1. chat_rooms 테이블 수정 (메타데이터 추가)
ALTER TABLE chat_rooms 
ADD COLUMN name VARCHAR(100),
ADD COLUMN last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- chat_rooms 테이블 코멘트 업데이트
COMMENT ON COLUMN chat_rooms.name IS '채팅방 이름 (그룹 채팅용, 1:1 채팅은 NULL)';
COMMENT ON COLUMN chat_rooms.last_message_at IS '마지막 메시지 시간';
COMMENT ON COLUMN chat_rooms.updated_at IS '채팅방 정보 수정 시간';

-- 2. chat_messages 테이블 수정
-- 기존 is_read 컬럼 제거 (별도 테이블로 관리)
ALTER TABLE chat_messages DROP COLUMN IF EXISTS is_read;

-- 메시지 타입 및 파일 관련 컬럼 추가
ALTER TABLE chat_messages 
ADD COLUMN message_type VARCHAR(20) DEFAULT 'text',
ADD COLUMN file_url TEXT,
ADD COLUMN file_name VARCHAR(255),
ADD COLUMN file_size BIGINT;

-- 메시지 타입 제약 조건 추가
ALTER TABLE chat_messages 
ADD CONSTRAINT chat_messages_type_check 
CHECK (message_type IN ('text', 'image', 'file', 'system'));

-- chat_messages 테이블 코멘트 업데이트
COMMENT ON COLUMN chat_messages.message_type IS '메시지 타입: text, image, file, system';
COMMENT ON COLUMN chat_messages.file_url IS '첨부 파일 URL (이미지/파일 메시지용)';
COMMENT ON COLUMN chat_messages.file_name IS '첨부 파일 원본 이름';
COMMENT ON COLUMN chat_messages.file_size IS '첨부 파일 크기 (bytes)';

-- 3. 메시지 읽음 상태 테이블 생성
CREATE TABLE IF NOT EXISTS public.message_read_status
(
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    read_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT message_read_status_pkey PRIMARY KEY (message_id, user_id),
    CONSTRAINT message_read_status_message_id_fkey FOREIGN KEY (message_id)
        REFERENCES public.chat_messages (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT message_read_status_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.message_read_status
    OWNER to socialspace_user;

COMMENT ON TABLE public.message_read_status
    IS '메시지 읽음 상태 테이블 (사용자별 메시지 읽음 시간 기록)';
COMMENT ON COLUMN public.message_read_status.message_id
    IS '읽은 메시지 ID';
COMMENT ON COLUMN public.message_read_status.user_id
    IS '메시지를 읽은 사용자 ID';
COMMENT ON COLUMN public.message_read_status.read_at
    IS '메시지를 읽은 시간';

-- 메시지 읽음 상태 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_message_read_status_message
    ON public.message_read_status USING btree
    (message_id ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_message_read_status_user
    ON public.message_read_status USING btree
    (user_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- 4. 사용자 채팅 설정 테이블 생성
CREATE TABLE IF NOT EXISTS public.user_chat_settings
(
    user_id uuid NOT NULL,
    allow_messages_from character varying(20) DEFAULT 'everyone'::character varying,
    show_online_status boolean DEFAULT true,
    notification_enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_chat_settings_pkey PRIMARY KEY (user_id),
    CONSTRAINT user_chat_settings_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT user_chat_settings_allow_messages_check CHECK (allow_messages_from::text = ANY (ARRAY['everyone'::character varying, 'followers'::character varying, 'none'::character varying]::text[]))
)
TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.user_chat_settings
    OWNER to socialspace_user;

COMMENT ON TABLE public.user_chat_settings
    IS '사용자별 채팅 설정 테이블';
COMMENT ON COLUMN public.user_chat_settings.user_id
    IS '사용자 ID';
COMMENT ON COLUMN public.user_chat_settings.allow_messages_from
    IS '메시지 수신 허용 범위: everyone(모든 사용자), followers(팔로워만), none(차단)';
COMMENT ON COLUMN public.user_chat_settings.show_online_status
    IS '온라인 상태 표시 여부';
COMMENT ON COLUMN public.user_chat_settings.notification_enabled
    IS '채팅 알림 활성화 여부';
COMMENT ON COLUMN public.user_chat_settings.created_at
    IS '설정 생성 시간';
COMMENT ON COLUMN public.user_chat_settings.updated_at
    IS '설정 수정 시간';

-- 5. 채팅방 멤버 테이블에 추가 정보 컬럼 추가
ALTER TABLE chat_room_members 
ADD COLUMN role VARCHAR(20) DEFAULT 'member',
ADD COLUMN is_muted boolean DEFAULT false,
ADD COLUMN last_read_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP;

-- 채팅방 멤버 역할 제약 조건 추가
ALTER TABLE chat_room_members 
ADD CONSTRAINT chat_room_members_role_check 
CHECK (role IN ('owner', 'admin', 'member'));

-- chat_room_members 테이블 코멘트 업데이트
COMMENT ON COLUMN chat_room_members.role IS '채팅방 내 역할: owner(방장), admin(관리자), member(일반 멤버)';
COMMENT ON COLUMN chat_room_members.is_muted IS '채팅방 알림 음소거 여부';
COMMENT ON COLUMN chat_room_members.last_read_at IS '마지막으로 채팅을 읽은 시간';

-- 6. 성능 최적화를 위한 추가 인덱스 생성

-- 채팅방별 최신 메시지 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_at
    ON public.chat_messages USING btree
    (room_id ASC NULLS LAST, created_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- 사용자별 채팅방 목록 조회용 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user_joined_at
    ON public.chat_room_members USING btree
    (user_id ASC NULLS LAST, joined_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- 채팅방 마지막 활동 시간 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message_at
    ON public.chat_rooms USING btree
    (last_message_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- 7. 기존 데이터 마이그레이션을 위한 기본값 설정

-- 기존 채팅방의 last_message_at을 created_at으로 초기화
UPDATE chat_rooms 
SET last_message_at = created_at 
WHERE last_message_at IS NULL;

-- 기존 채팅방의 updated_at을 created_at으로 초기화
UPDATE chat_rooms 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- 기존 채팅방 멤버의 역할을 'member'로 초기화 (첫 번째 멤버는 'owner'로 설정)
UPDATE chat_room_members 
SET role = 'member' 
WHERE role IS NULL;

-- 각 채팅방의 첫 번째 멤버를 owner로 설정
WITH first_members AS (
    SELECT DISTINCT ON (room_id) room_id, user_id
    FROM chat_room_members
    ORDER BY room_id, joined_at ASC
)
UPDATE chat_room_members 
SET role = 'owner'
FROM first_members
WHERE chat_room_members.room_id = first_members.room_id 
  AND chat_room_members.user_id = first_members.user_id;

-- 8. 트리거 함수 생성 (채팅방 last_message_at 자동 업데이트)
CREATE OR REPLACE FUNCTION update_chat_room_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_rooms 
    SET last_message_at = NEW.created_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.room_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS trigger_update_chat_room_last_message ON chat_messages;
CREATE TRIGGER trigger_update_chat_room_last_message
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_room_last_message();

-- 9. 사용자 채팅 설정 기본값 생성 함수
CREATE OR REPLACE FUNCTION create_default_chat_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_chat_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 새 사용자 생성시 기본 채팅 설정 생성 트리거
DROP TRIGGER IF EXISTS trigger_create_default_chat_settings ON users;
CREATE TRIGGER trigger_create_default_chat_settings
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_chat_settings();

-- 10. 기존 사용자들에 대한 기본 채팅 설정 생성
INSERT INTO user_chat_settings (user_id)
SELECT id FROM users
WHERE id NOT IN (SELECT user_id FROM user_chat_settings)
ON CONFLICT (user_id) DO NOTHING;

-- 마이그레이션 완료 확인용 쿼리 (실행 후 결과 확인용)
-- SELECT 'Migration completed successfully' as status;

