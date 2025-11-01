-- 여기의 테이블 생성 및 테이블 업데이트의 쿼리들은 내가 적용한 쿼리들입니다.
-- 여기의 쿼리를 참조해서 추후 CRUD를 작성할때 참조해주세요

-- USERS
CREATE TABLE IF NOT EXISTS public.users
(
    id uuid NOT NULL,
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    nickname character varying(50) COLLATE pg_catalog."default",
    bio text COLLATE pg_catalog."default",
    profile_image text COLLATE pg_catalog."default",
    visibility character varying(20) COLLATE pg_catalog."default" DEFAULT 'public'::character varying,
    role character varying(20) COLLATE pg_catalog."default" DEFAULT 'user'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_custom_profile_image boolean DEFAULT false,
    follow_approval_mode character varying(20) COLLATE pg_catalog."default" DEFAULT 'auto'::character varying,
    show_mutual_follow boolean DEFAULT true,
    notification_preferences jsonb DEFAULT '{"like": true, "push": true, "email": false, "follow": true, "comment": true, "mention": true}'::jsonb,
    showmutualfollow boolean DEFAULT true,
    password_hash character varying(255) COLLATE pg_catalog."default",
    auth_provider character varying(20) COLLATE pg_catalog."default" DEFAULT 'local'::character varying,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_nickname_key UNIQUE (nickname),
    CONSTRAINT users_username_key UNIQUE (username),
    CONSTRAINT check_auth_provider_values CHECK (auth_provider::text = ANY (ARRAY['local'::character varying, 'google'::character varying]::text[])),
    CONSTRAINT check_local_user_password CHECK (auth_provider::text = 'local'::text AND password_hash IS NOT NULL OR auth_provider::text = 'google'::text AND password_hash IS NULL OR (auth_provider::text <> ALL (ARRAY['local'::character varying, 'google'::character varying]::text[])))
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.users
    OWNER to socialspace_user;
COMMENT ON TABLE public.users
    IS '사용자 계정 정보 테이블';
COMMENT ON COLUMN public.users.id
    IS '사용자 고유 ID';
COMMENT ON COLUMN public.users.email
    IS '이메일 (로그인용)';
COMMENT ON COLUMN public.users.username
    IS '프로필용 유저네임 (/users/username)';
COMMENT ON COLUMN public.users.nickname
    IS '닉네임';
COMMENT ON COLUMN public.users.bio
    IS '자기소개';
COMMENT ON COLUMN public.users.profile_image
    IS '프로필 이미지 URL (Cloudinary)';
COMMENT ON COLUMN public.users.visibility
    IS '프로필 공개 범위: public, followers, private';
COMMENT ON COLUMN public.users.role
    IS '사용자 권한: admin, manager, user, banned';
COMMENT ON COLUMN public.users.created_at
    IS '계정 생성일시';
COMMENT ON COLUMN public.users.is_custom_profile_image
    IS '사용자가 직접 설정한 프로필 이미지 여부 (true: 사용자 설정, false: 구글 기본 이미지)';
COMMENT ON COLUMN public.users.follow_approval_mode
    IS '팔로우 승인 방식 (auto: 자동 승인, manual: 수동 승인)';
COMMENT ON COLUMN public.users.show_mutual_follow
    IS '맞팔로우 관계 표시 여부 (true: 표시, false: 숨김)';
COMMENT ON COLUMN public.users.notification_preferences
    IS '사용자 알림 설정 (JSON 형태)
- follow: 팔로우 알림 (누군가 나를 팔로우함)
- followee_post: 팔로잉 게시물 알림 (팔로우한 사람의 새 게시물)
- post_liked: 게시물 좋아요 알림 (내 게시물에 좋아요)
- comment_liked: 댓글 좋아요 알림 (내 댓글에 좋아요)
- post_commented: 게시물 댓글 알림 (내 게시물에 댓글)
- mention_comment: 멘션 알림 (댓글에서 멘션됨)';
COMMENT ON COLUMN public.users.password_hash
    IS '비밀번호 해시 (bcrypt 60자, local 인증 전용, Google 사용자는 NULL)';
COMMENT ON COLUMN public.users.auth_provider
    IS '인증 제공자: google (Google OAuth), local (이메일/비밀번호)';

CREATE INDEX IF NOT EXISTS idx_users_auth_provider
    ON public.users USING btree
    (auth_provider COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_users_email_auth_provider
    ON public.users USING btree
    (email COLLATE pg_catalog."default" ASC NULLS LAST, auth_provider COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_users_nickname
    ON public.users USING btree
    (nickname COLLATE pg_catalog."default" ASC NULLS LAST)
    TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_users_notification_preferences
    ON public.users USING gin
    (notification_preferences)
    TABLESPACE pg_default;

CREATE OR REPLACE TRIGGER trigger_create_default_chat_settings
    AFTER INSERT
    ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_chat_settings();

-- 차단 테이블
CREATE TABLE IF NOT EXISTS public.user_blocks
(
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.user_blocks
    OWNER to socialspace_user;
COMMENT ON TABLE public.user_blocks
    IS '사용자 차단 관계 테이블';
COMMENT ON COLUMN public.user_blocks.blocker_id
    IS '차단한 사용자 ID';
COMMENT ON COLUMN public.user_blocks.blocked_id
    IS '차단당한 사용자 ID';

-- 친한친구 지정
CREATE TABLE IF NOT EXISTS public.user_favorites
(
    user_id uuid NOT NULL,
    favorite_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_favorites_pkey PRIMARY KEY (user_id, favorite_id),
    CONSTRAINT user_favorites_favorite_id_fkey FOREIGN KEY (favorite_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT user_favorites_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.user_favorites
    OWNER to socialspace_user;
COMMENT ON TABLE public.user_favorites
    IS '친한 친구 지정 테이블';
COMMENT ON COLUMN public.user_favorites.user_id
    IS '친한 친구를 지정한 사용자 ID';
COMMENT ON COLUMN public.user_favorites.favorite_id
    IS '지정된 친한 친구 사용자 ID';

-- POSTS
CREATE TABLE IF NOT EXISTS public.posts
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    content text COLLATE pg_catalog."default",
    thumbnail_url text COLLATE pg_catalog."default",
    og_link text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    visibility character varying(20) COLLATE pg_catalog."default" DEFAULT 'public'::character varying,
    hide_likes boolean DEFAULT false,
    hide_views boolean DEFAULT false,
    allow_comments boolean DEFAULT true,
    is_edited boolean DEFAULT false,
    CONSTRAINT posts_pkey PRIMARY KEY (id),
    CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT posts_visibility_check CHECK (visibility::text = ANY (ARRAY['public'::character varying, 'followers'::character varying, 'private'::character varying]::text[]))
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.posts
    OWNER to socialspace_user;
COMMENT ON TABLE public.posts
    IS '게시글 정보 테이블';
COMMENT ON COLUMN public.posts.id
    IS '게시글 고유 ID';
COMMENT ON COLUMN public.posts.user_id
    IS '작성자 ID';
COMMENT ON COLUMN public.posts.content
    IS '게시글 본문 텍스트';
COMMENT ON COLUMN public.posts.thumbnail_url
    IS '썸네일 이미지 URL';
COMMENT ON COLUMN public.posts.og_link
    IS '링크 카드용 OG URL';
COMMENT ON COLUMN public.posts.created_at
    IS '게시글 생성일시';
COMMENT ON COLUMN public.posts.updated_at
    IS '게시글 수정일시';
COMMENT ON COLUMN public.posts.hide_likes
    IS '좋아요 수 숨기기 여부';
COMMENT ON COLUMN public.posts.hide_views
    IS '조회수 숨기기 여부';
COMMENT ON COLUMN public.posts.allow_comments
    IS '댓글 허용 여부';
COMMENT ON COLUMN public.posts.is_edited
    IS '게시글 수정 여부';
-- POST IMAGES
CREATE TABLE IF NOT EXISTS public.post_images
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    post_id uuid,
    image_url text COLLATE pg_catalog."default" NOT NULL,
    order_index integer,
    CONSTRAINT post_images_pkey PRIMARY KEY (id),
    CONSTRAINT post_images_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.post_images
    OWNER to socialspace_user;
COMMENT ON TABLE public.post_images
    IS '게시글 이미지 테이블';
COMMENT ON COLUMN public.post_images.post_id
    IS '해당 게시글 ID';
COMMENT ON COLUMN public.post_images.image_url
    IS '이미지 URL';
COMMENT ON COLUMN public.post_images.order_index
    IS '이미지 순서';

-- HASHTAGS
CREATE TABLE IF NOT EXISTS public.hashtags
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tag character varying(100) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT hashtags_pkey PRIMARY KEY (id),
    CONSTRAINT hashtags_tag_key UNIQUE (tag)
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.hashtags
    OWNER to socialspace_user;
COMMENT ON TABLE public.hashtags
    IS '해시태그 테이블';
COMMENT ON COLUMN public.hashtags.tag
    IS '해시태그 내용 (# 없이 저장)';

-- POST_HASHTAGS (Join Table)
CREATE TABLE IF NOT EXISTS public.post_hashtags
(
    post_id uuid NOT NULL,
    hashtag_id uuid NOT NULL,
    CONSTRAINT post_hashtags_pkey PRIMARY KEY (post_id, hashtag_id),
    CONSTRAINT post_hashtags_hashtag_id_fkey FOREIGN KEY (hashtag_id)
        REFERENCES public.hashtags (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT post_hashtags_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.post_hashtags
    OWNER to socialspace_user;
COMMENT ON TABLE public.post_hashtags
    IS '게시글-해시태그 연결 테이블';

-- COMMENTS
CREATE TABLE IF NOT EXISTS public.comments
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    post_id uuid,
    user_id uuid,
    parent_id uuid,
    content text COLLATE pg_catalog."default",
    is_edited boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comments_pkey PRIMARY KEY (id),
    CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id)
        REFERENCES public.comments (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT comments_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.comments
    OWNER to socialspace_user;
COMMENT ON TABLE public.comments
    IS '댓글 테이블';
COMMENT ON COLUMN public.comments.post_id
    IS '해당 게시글 ID';
COMMENT ON COLUMN public.comments.user_id
    IS '댓글 작성자 ID';
COMMENT ON COLUMN public.comments.parent_id
    IS '부모 댓글 ID (대댓글용)';
COMMENT ON COLUMN public.comments.content
    IS '댓글 내용';
COMMENT ON COLUMN public.comments.is_edited
    IS '수정 여부';

-- LIKES
CREATE TABLE IF NOT EXISTS public.likes
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    target_id uuid NOT NULL,
    target_type character varying(20) COLLATE pg_catalog."default" NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT likes_pkey PRIMARY KEY (id),
    CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT likes_target_type_check CHECK (target_type::text = ANY (ARRAY['post'::character varying, 'comment'::character varying]::text[]))
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.likes
    OWNER to socialspace_user;
COMMENT ON TABLE public.likes
    IS '좋아요 테이블';
COMMENT ON COLUMN public.likes.user_id
    IS '좋아요 누른 사용자 ID';
COMMENT ON COLUMN public.likes.target_id
    IS '대상 ID (게시글 또는 댓글)';
COMMENT ON COLUMN public.likes.target_type
    IS '대상 유형: post 또는 comment';

-- BOOKMARKS
CREATE TABLE IF NOT EXISTS public.bookmarks
(
    user_id uuid NOT NULL,
    post_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bookmarks_pkey PRIMARY KEY (user_id, post_id),
    CONSTRAINT bookmarks_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT bookmarks_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.bookmarks
    OWNER to socialspace_user;
COMMENT ON TABLE public.bookmarks
    IS '북마크 테이블';
COMMENT ON COLUMN public.bookmarks.user_id
    IS '북마크한 사용자 ID';
COMMENT ON COLUMN public.bookmarks.post_id
    IS '북마크한 게시글 ID';

-- FOLLOWS
CREATE TABLE IF NOT EXISTS public.follows
(
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    is_accepted boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id),
    CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.follows
    OWNER to socialspace_user;
COMMENT ON TABLE public.follows
    IS '팔로우 관계 테이블';
COMMENT ON COLUMN public.follows.follower_id
    IS '팔로우를 거는 사람 ID';
COMMENT ON COLUMN public.follows.following_id
    IS '팔로우 받는 사람 ID';
COMMENT ON COLUMN public.follows.is_accepted
    IS '팔로우 수락 여부';

-- ROOMS
CREATE TABLE IF NOT EXISTS public.chat_rooms
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    is_group boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    name character varying(100) COLLATE pg_catalog."default",
    last_message_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_rooms_pkey PRIMARY KEY (id)
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.chat_rooms
    OWNER to socialspace_user;
COMMENT ON TABLE public.chat_rooms
    IS '채팅방 테이블';
COMMENT ON COLUMN public.chat_rooms.is_group
    IS '단체 채팅 여부';
COMMENT ON COLUMN public.chat_rooms.name
    IS '채팅방 이름 (그룹 채팅용, 1:1 채팅은 NULL)';
COMMENT ON COLUMN public.chat_rooms.last_message_at
    IS '마지막 메시지 시간';
COMMENT ON COLUMN public.chat_rooms.updated_at
    IS '채팅방 정보 수정 시간';
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message_at
    ON public.chat_rooms USING btree
    (last_message_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- ROOM MEMBERS
CREATE TABLE IF NOT EXISTS public.chat_room_members
(
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    role character varying(20) COLLATE pg_catalog."default" DEFAULT 'member'::character varying,
    is_muted boolean DEFAULT false,
    last_read_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_room_members_pkey PRIMARY KEY (room_id, user_id),
    CONSTRAINT chat_room_members_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_room_members_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_room_members_role_check CHECK (role::text = ANY (ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying]::text[]))
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.chat_room_members
    OWNER to socialspace_user;
COMMENT ON TABLE public.chat_room_members
    IS '채팅방 멤버 테이블';
COMMENT ON COLUMN public.chat_room_members.role
    IS '채팅방 내 역할: owner(방장), admin(관리자), member(일반 멤버)';
COMMENT ON COLUMN public.chat_room_members.is_muted
    IS '채팅방 알림 음소거 여부';
COMMENT ON COLUMN public.chat_room_members.last_read_at
    IS '마지막으로 채팅을 읽은 시간';
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user_joined_at
    ON public.chat_room_members USING btree
    (user_id ASC NULLS LAST, joined_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    room_id uuid,
    sender_id uuid,
    content text COLLATE pg_catalog."default",
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    message_type character varying(20) COLLATE pg_catalog."default" DEFAULT 'text'::character varying,
    file_url text COLLATE pg_catalog."default",
    file_name character varying(255) COLLATE pg_catalog."default",
    file_size bigint,
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
    CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_messages_type_check CHECK (message_type::text = ANY (ARRAY['text'::character varying, 'image'::character varying, 'file'::character varying, 'system'::character varying]::text[]))
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.chat_messages
    OWNER to socialspace_user;
COMMENT ON TABLE public.chat_messages
    IS '채팅 메시지 테이블';
COMMENT ON COLUMN public.chat_messages.room_id
    IS '채팅방 ID';
COMMENT ON COLUMN public.chat_messages.sender_id
    IS '메시지 보낸 사용자 ID';
COMMENT ON COLUMN public.chat_messages.content
    IS '메시지 내용';
COMMENT ON COLUMN public.chat_messages.message_type
    IS '메시지 타입: text, image, file, system';
COMMENT ON COLUMN public.chat_messages.file_url
    IS '첨부 파일 URL (이미지/파일 메시지용)';
COMMENT ON COLUMN public.chat_messages.file_name
    IS '첨부 파일 원본 이름';
COMMENT ON COLUMN public.chat_messages.file_size
    IS '첨부 파일 크기 (bytes)';
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_at
    ON public.chat_messages USING btree
    (room_id ASC NULLS LAST, created_at DESC NULLS FIRST)
    TABLESPACE pg_default;

CREATE OR REPLACE TRIGGER trigger_update_chat_room_last_message
    AFTER INSERT
    ON public.chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_chat_room_last_message();

-- USER_CHAT_SETTINGS
CREATE TABLE IF NOT EXISTS public.user_chat_settings
(
    user_id uuid NOT NULL,
    allow_messages_from character varying(20) COLLATE pg_catalog."default" DEFAULT 'everyone'::character varying,
    show_online_status boolean DEFAULT true,
    notification_enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_chat_settings_pkey PRIMARY KEY (user_id),
    CONSTRAINT user_chat_settings_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT user_chat_settings_allow_messages_check CHECK (allow_messages_from::text = ANY (ARRAY['everyone'::character varying::text, 'followers'::character varying::text, 'none'::character varying::text]))
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

-- MESSAGE_READ_STATUS
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
CREATE INDEX IF NOT EXISTS idx_message_read_status_message
    ON public.message_read_status USING btree
    (message_id ASC NULLS LAST)
    TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_message_read_status_user
    ON public.message_read_status USING btree
    (user_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    type character varying(30) COLLATE pg_catalog."default" NOT NULL,
    from_user_id uuid,
    target_id uuid,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_from_user_id_fkey FOREIGN KEY (from_user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE SET NULL,
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.notifications
    OWNER to socialspace_user;
COMMENT ON TABLE public.notifications
    IS '알림 테이블';
COMMENT ON COLUMN public.notifications.user_id
    IS '알림 수신 사용자 ID';
COMMENT ON COLUMN public.notifications.type
    IS '알림 타입: follow, like, comment 등';
COMMENT ON COLUMN public.notifications.from_user_id
    IS '알림 발생시킨 사용자 ID';
COMMENT ON COLUMN public.notifications.target_id
    IS '관련 대상 ID (게시글, 댓글 등)';
COMMENT ON COLUMN public.notifications.is_read
    IS '알림 읽음 여부';

-- 게시글 조회 기록 테이블
CREATE TABLE IF NOT EXISTS public.post_views
(
    post_id uuid NOT NULL,
    user_id uuid,
    ip_address inet,
    viewed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    view_duration integer DEFAULT 0,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    CONSTRAINT post_views_pkey PRIMARY KEY (id),
    CONSTRAINT uq_post_views_post_ip UNIQUE (post_id, ip_address),
    CONSTRAINT uq_post_views_post_user UNIQUE (post_id, user_id),
    CONSTRAINT post_views_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT post_views_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.post_views
    OWNER to socialspace_user;
COMMENT ON TABLE public.post_views
    IS '게시글 조회 기록 테이블 (회원은 user_id 기준, 비회원은 ip_address 기준으로 기록)';
COMMENT ON COLUMN public.post_views.post_id
    IS '조회된 게시글 ID';
COMMENT ON COLUMN public.post_views.user_id
    IS '조회한 로그인 사용자 ID (nullable)';
COMMENT ON COLUMN public.post_views.ip_address
    IS '비회원 조회자의 IP 주소';
COMMENT ON COLUMN public.post_views.viewed_at
    IS '게시글이 조회된 시간';
COMMENT ON COLUMN public.post_views.view_duration
    IS '게시글을 본 시간(초)';
CREATE INDEX IF NOT EXISTS idx_post_views_post
    ON public.post_views USING btree
    (post_id ASC NULLS LAST)
    TABLESPACE pg_default;

-- 댓글 멘션 테이블
CREATE TABLE IF NOT EXISTS public.comment_mentions
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    comment_id uuid NOT NULL,
    mentioned_user_id uuid NOT NULL,
    start_index integer,
    length integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comment_mentions_pkey PRIMARY KEY (id),
    CONSTRAINT comment_mentions_comment_id_fkey FOREIGN KEY (comment_id)
        REFERENCES public.comments (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT comment_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.comment_mentions
    OWNER to socialspace_user;
COMMENT ON TABLE public.comment_mentions
    IS '댓글/대댓글에서 유저 멘션을 저장하는 테이블';
COMMENT ON COLUMN public.comment_mentions.comment_id
    IS '멘션이 포함된 댓글 ID';
COMMENT ON COLUMN public.comment_mentions.mentioned_user_id
    IS '멘션된 사용자 ID';
COMMENT ON COLUMN public.comment_mentions.start_index
    IS '멘션 시작 인덱스(UTF-16 기준 권장)';
COMMENT ON COLUMN public.comment_mentions.length
    IS '멘션 길이';
COMMENT ON COLUMN public.comment_mentions.created_at
    IS '멘션이 생성된 시각';
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment
    ON public.comment_mentions USING btree
    (comment_id ASC NULLS LAST)
    TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user
    ON public.comment_mentions USING btree
    (mentioned_user_id ASC NULLS LAST)
    TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user_created_at
    ON public.comment_mentions USING btree
    (mentioned_user_id ASC NULLS LAST, created_at DESC NULLS FIRST)
    TABLESPACE pg_default;

-- 게시글 멘션 테이블
CREATE TABLE IF NOT EXISTS public.post_mentions
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    post_id uuid NOT NULL,
    mentioned_user_id uuid NOT NULL,
    start_index integer,
    length integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT post_mentions_pkey PRIMARY KEY (id),
    CONSTRAINT post_mentions_mentioned_user_id_fkey FOREIGN KEY (mentioned_user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT post_mentions_post_id_fkey FOREIGN KEY (post_id)
        REFERENCES public.posts (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.post_mentions
    OWNER to socialspace_user;
COMMENT ON TABLE public.post_mentions
    IS '게시글에서 유저 멘션을 저장하는 테이블';
COMMENT ON COLUMN public.post_mentions.post_id
    IS '멘션이 포함된 게시글 ID';
COMMENT ON COLUMN public.post_mentions.mentioned_user_id
    IS '멘션된 사용자 ID';
COMMENT ON COLUMN public.post_mentions.start_index
    IS '멘션 시작 인덱스(UTF-16 기준 권장)';
COMMENT ON COLUMN public.post_mentions.length
    IS '멘션 길이';
COMMENT ON COLUMN public.post_mentions.created_at
    IS '멘션이 생성된 시각';
CREATE INDEX IF NOT EXISTS idx_post_mentions_post
    ON public.post_mentions USING btree
    (post_id ASC NULLS LAST)
    TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_post_mentions_user
    ON public.post_mentions USING btree
    (mentioned_user_id ASC NULLS LAST)
    TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_post_mentions_user_created_at
    ON public.post_mentions USING btree
    (mentioned_user_id ASC NULLS LAST, created_at DESC NULLS FIRST)
    TABLESPACE pg_default;