-- 여기의 테이블 생성 및 테이블 업데이트의 쿼리들은 내가 적용한 쿼리들입니다.
-- 여기의 쿼리를 참조해서 추후 CRUD를 작성할때 참조해주세요

-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    nickname VARCHAR(50),
    bio TEXT,
    profile_image TEXT,
    visibility VARCHAR(20) DEFAULT 'public',
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 차단 테이블
CREATE TABLE user_blocks (
    blocker_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- 차단한 사람
    blocked_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- 차단당한 사람
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id)
);

COMMENT ON TABLE user_blocks IS '사용자 차단 관계 테이블';
COMMENT ON COLUMN user_blocks.blocker_id IS '차단한 사용자 ID';
COMMENT ON COLUMN user_blocks.blocked_id IS '차단당한 사용자 ID';

-- 친한친구 지정
CREATE TABLE user_favorites (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,     -- 나
    favorite_id UUID REFERENCES users(id) ON DELETE CASCADE, -- 내가 지정한 친한 친구
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, favorite_id)
);

COMMENT ON TABLE user_favorites IS '친한 친구 지정 테이블';
COMMENT ON COLUMN user_favorites.user_id IS '친한 친구를 지정한 사용자 ID';
COMMENT ON COLUMN user_favorites.favorite_id IS '지정된 친한 친구 사용자 ID';

-- POSTS
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    thumbnail_url TEXT,
    og_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POST IMAGES
CREATE TABLE post_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    order_index INT
);

-- HASHTAGS
CREATE TABLE hashtags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- POST_HASHTAGS (Join Table)
CREATE TABLE post_hashtags (
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    hashtag_id UUID REFERENCES hashtags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, hashtag_id)
);

-- COMMENTS
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT,
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- LIKES
CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_id UUID NOT NULL,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BOOKMARKS
CREATE TABLE bookmarks (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, post_id)
);

-- FOLLOWS
CREATE TABLE follows (
    follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID REFERENCES users(id) ON DELETE CASCADE,
    is_accepted BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, following_id)
);

-- ROOMS
CREATE TABLE chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ROOM MEMBERS
CREATE TABLE chat_room_members (
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

-- MESSAGES
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NOTIFICATIONS
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    target_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- USERS 테이블: 사용자 계정 정보
COMMENT ON TABLE users IS '사용자 계정 정보 테이블';
COMMENT ON COLUMN users.id IS '사용자 고유 ID';
COMMENT ON COLUMN users.email IS '이메일 (로그인용)';
COMMENT ON COLUMN users.username IS '프로필용 유저네임 (/users/username)';
COMMENT ON COLUMN users.nickname IS '닉네임';
COMMENT ON COLUMN users.bio IS '자기소개';
COMMENT ON COLUMN users.profile_image IS '프로필 이미지 URL (Cloudinary)';
COMMENT ON COLUMN users.visibility IS '프로필 공개 범위: public, followers, private';
COMMENT ON COLUMN users.role IS '사용자 권한: admin, manager, user, banned';
COMMENT ON COLUMN users.created_at IS '계정 생성일시';

-- POSTS 테이블: 게시글 정보
COMMENT ON TABLE posts IS '게시글 정보 테이블';
COMMENT ON COLUMN posts.id IS '게시글 고유 ID';
COMMENT ON COLUMN posts.user_id IS '작성자 ID';
COMMENT ON COLUMN posts.content IS '게시글 본문 텍스트';
COMMENT ON COLUMN posts.thumbnail_url IS '썸네일 이미지 URL';
COMMENT ON COLUMN posts.og_link IS '링크 카드용 OG URL';
COMMENT ON COLUMN posts.created_at IS '게시글 생성일시';
COMMENT ON COLUMN posts.updated_at IS '게시글 수정일시';

-- POST_IMAGES 테이블: 게시글에 포함된 이미지
COMMENT ON TABLE post_images IS '게시글 이미지 테이블';
COMMENT ON COLUMN post_images.post_id IS '해당 게시글 ID';
COMMENT ON COLUMN post_images.image_url IS '이미지 URL';
COMMENT ON COLUMN post_images.order_index IS '이미지 순서';

-- HASHTAGS 테이블: 해시태그 정보
COMMENT ON TABLE hashtags IS '해시태그 테이블';
COMMENT ON COLUMN hashtags.tag IS '해시태그 내용 (# 없이 저장)';

-- POST_HASHTAGS 테이블: 게시글과 해시태그 연결 테이블
COMMENT ON TABLE post_hashtags IS '게시글-해시태그 연결 테이블';

-- COMMENTS 테이블: 댓글 및 대댓글 정보
COMMENT ON TABLE comments IS '댓글 테이블';
COMMENT ON COLUMN comments.post_id IS '해당 게시글 ID';
COMMENT ON COLUMN comments.user_id IS '댓글 작성자 ID';
COMMENT ON COLUMN comments.parent_id IS '부모 댓글 ID (대댓글용)';
COMMENT ON COLUMN comments.content IS '댓글 내용';
COMMENT ON COLUMN comments.is_edited IS '수정 여부';

-- LIKES 테이블: 좋아요 기록
COMMENT ON TABLE likes IS '좋아요 테이블';
COMMENT ON COLUMN likes.user_id IS '좋아요 누른 사용자 ID';
COMMENT ON COLUMN likes.target_id IS '대상 ID (게시글 또는 댓글)';
COMMENT ON COLUMN likes.target_type IS '대상 유형: post 또는 comment';

-- BOOKMARKS 테이블: 북마크 저장
COMMENT ON TABLE bookmarks IS '북마크 테이블';
COMMENT ON COLUMN bookmarks.user_id IS '북마크한 사용자 ID';
COMMENT ON COLUMN bookmarks.post_id IS '북마크한 게시글 ID';

-- FOLLOWS 테이블: 팔로우 관계
COMMENT ON TABLE follows IS '팔로우 관계 테이블';
COMMENT ON COLUMN follows.follower_id IS '팔로우를 거는 사람 ID';
COMMENT ON COLUMN follows.following_id IS '팔로우 받는 사람 ID';
COMMENT ON COLUMN follows.is_accepted IS '팔로우 수락 여부';

-- ROOMS 테이블: 채팅방 정보
COMMENT ON TABLE chat_rooms IS '채팅방 테이블';
COMMENT ON COLUMN chat_rooms.is_group IS '단체 채팅 여부';

-- ROOM_MEMBERS 테이블: 채팅방 멤버 정보
COMMENT ON TABLE chat_room_members IS '채팅방 멤버 테이블';

-- MESSAGES 테이블: 메시지 정보
COMMENT ON TABLE chat_messages IS '채팅 메시지 테이블';
COMMENT ON COLUMN chat_messages.room_id IS '채팅방 ID';
COMMENT ON COLUMN chat_messages.sender_id IS '메시지 보낸 사용자 ID';
COMMENT ON COLUMN chat_messages.content IS '메시지 내용';
COMMENT ON COLUMN chat_messages.is_read IS '읽음 여부';

-- NOTIFICATIONS 테이블: 알림 정보
COMMENT ON TABLE notifications IS '알림 테이블';
COMMENT ON COLUMN notifications.user_id IS '알림 수신 사용자 ID';
COMMENT ON COLUMN notifications.type IS '알림 타입: follow, like, comment 등';
COMMENT ON COLUMN notifications.from_user_id IS '알림 발생시킨 사용자 ID';
COMMENT ON COLUMN notifications.target_id IS '관련 대상 ID (게시글, 댓글 등)';
COMMENT ON COLUMN notifications.is_read IS '알림 읽음 여부';

ALTER TABLE users
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE posts
ADD COLUMN visibility VARCHAR(20) DEFAULT 'public' CHECK (visibility IN ('public', 'private'));

ALTER TABLE posts
ADD COLUMN hide_likes BOOLEAN DEFAULT FALSE,
ADD COLUMN hide_views BOOLEAN DEFAULT FALSE,
ADD COLUMN allow_comments BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN posts.hide_likes IS '좋아요 수 숨기기 여부';
COMMENT ON COLUMN posts.hide_views IS '조회수 숨기기 여부';
COMMENT ON COLUMN posts.allow_comments IS '댓글 허용 여부';