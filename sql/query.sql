-- 여기의 테이블 생성 및 테이블 업데이트의 쿼리들은 내가 적용한 쿼리들입니다.
-- 여기의 쿼리를 참조해서 추후 CRUD를 작성할때 참조해주세요

-- USERS
CREATE TABLE IF NOT EXISTS public.users
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    username character varying(50) COLLATE pg_catalog."default" NOT NULL,
    nickname character varying(50) COLLATE pg_catalog."default",
    bio text COLLATE pg_catalog."default",
    profile_image text COLLATE pg_catalog."default",
    visibility character varying(20) COLLATE pg_catalog."default" DEFAULT 'public'::character varying,
    role character varying(20) COLLATE pg_catalog."default" DEFAULT 'user'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_pkey PRIMARY KEY (id),
    CONSTRAINT users_email_key UNIQUE (email),
    CONSTRAINT users_username_key UNIQUE (username)
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
    CONSTRAINT chat_rooms_pkey PRIMARY KEY (id)
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.chat_rooms
    OWNER to socialspace_user;
COMMENT ON TABLE public.chat_rooms
    IS '채팅방 테이블';
COMMENT ON COLUMN public.chat_rooms.is_group
    IS '단체 채팅 여부';

-- ROOM MEMBERS
CREATE TABLE IF NOT EXISTS public.chat_room_members
(
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_room_members_pkey PRIMARY KEY (room_id, user_id),
    CONSTRAINT chat_room_members_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_room_members_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)
TABLESPACE pg_default;
ALTER TABLE IF EXISTS public.chat_room_members
    OWNER to socialspace_user;
COMMENT ON TABLE public.chat_room_members
    IS '채팅방 멤버 테이블';

-- MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages
(
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    room_id uuid,
    sender_id uuid,
    content text COLLATE pg_catalog."default",
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
    CONSTRAINT chat_messages_room_id_fkey FOREIGN KEY (room_id)
        REFERENCES public.chat_rooms (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE,
    CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id)
        REFERENCES public.users (id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
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
COMMENT ON COLUMN public.chat_messages.is_read
    IS '읽음 여부';

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
    user_id uuid NOT NULL,
    ip_address inet NOT NULL,
    viewed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT post_views_pkey PRIMARY KEY (post_id, user_id, ip_address),
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
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_ip_view
    ON public.post_views USING btree
    (post_id ASC NULLS LAST, ip_address ASC NULLS LAST)
    TABLESPACE pg_default
    WHERE ip_address IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_post_user_view
    ON public.post_views USING btree
    (post_id ASC NULLS LAST, user_id ASC NULLS LAST)
    TABLESPACE pg_default
    WHERE user_id IS NOT NULL;