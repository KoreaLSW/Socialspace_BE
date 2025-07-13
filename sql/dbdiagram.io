// USERS
Table users {
  id UUID [pk, note: 'default: gen_random_uuid()']
  email VARCHAR(255) [unique, not null]
  username VARCHAR(50) [unique, not null]
  nickname VARCHAR(50)
  bio TEXT
  profile_image TEXT
  visibility VARCHAR(20) [note: 'default: public']
  role VARCHAR(20) [note: 'default: user']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  updated_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// POSTS
Table posts {
  id UUID [pk, note: 'default: gen_random_uuid()']
  user_id UUID [ref: > users.id]
  content TEXT
  thumbnail_url TEXT
  og_link TEXT
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  updated_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  visibility VARCHAR(20) [note: 'default: public']
  hide_likes BOOLEAN [note: 'default: false']
  hide_views BOOLEAN [note: 'default: false']
  allow_comments BOOLEAN [note: 'default: true']
}

// POST_IMAGES
Table post_images {
  id UUID [pk, note: 'default: gen_random_uuid()']
  post_id UUID [ref: > posts.id]
  image_url TEXT
  order_index INT
}

// HASHTAGS
Table hashtags {
  id UUID [pk, note: 'default: gen_random_uuid()']
  tag VARCHAR(100) [unique]
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// POST_HASHTAGS
Table post_hashtags {
  post_id UUID [ref: > posts.id]
  hashtag_id UUID [ref: > hashtags.id]
  Note: 'pk(post_id, hashtag_id)'
}

// COMMENTS
Table comments {
  id UUID [pk, note: 'default: gen_random_uuid()']
  post_id UUID [ref: > posts.id]
  user_id UUID [ref: > users.id]
  parent_id UUID [ref: > comments.id]
  content TEXT
  is_edited BOOLEAN [note: 'default: false']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// LIKES
Table likes {
  id UUID [pk, note: 'default: gen_random_uuid()']
  user_id UUID [ref: > users.id]
  target_id UUID
  target_type VARCHAR(20)
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// BOOKMARKS
Table bookmarks {
  user_id UUID [ref: > users.id]
  post_id UUID [ref: > posts.id]
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(user_id, post_id)'
}

// FOLLOWS
Table follows {
  follower_id UUID [ref: > users.id]
  following_id UUID [ref: > users.id]
  is_accepted BOOLEAN [note: 'default: true']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(follower_id, following_id)'
}

// CHAT_ROOMS
Table chat_rooms {
  id UUID [pk, note: 'default: gen_random_uuid()']
  is_group BOOLEAN [note: 'default: false']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// CHAT_ROOM_MEMBERS
Table chat_room_members {
  room_id UUID [ref: > chat_rooms.id]
  user_id UUID [ref: > users.id]
  joined_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(room_id, user_id)'
}

// CHAT_MESSAGES
Table chat_messages {
  id UUID [pk, note: 'default: gen_random_uuid()']
  room_id UUID [ref: > chat_rooms.id]
  sender_id UUID [ref: > users.id]
  content TEXT
  is_read BOOLEAN [note: 'default: false']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// NOTIFICATIONS
Table notifications {
  id UUID [pk, note: 'default: gen_random_uuid()']
  user_id UUID [ref: > users.id]
  type VARCHAR(30)
  from_user_id UUID [ref: > users.id]
  target_id UUID
  is_read BOOLEAN [note: 'default: false']
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
}

// USER_BLOCKS
Table user_blocks {
  blocker_id UUID [ref: > users.id]
  blocked_id UUID [ref: > users.id]
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(blocker_id, blocked_id)'
}

// USER_FAVORITES
Table user_favorites {
  user_id UUID [ref: > users.id]
  favorite_id UUID [ref: > users.id]
  created_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(user_id, favorite_id)'
}

// POST_VIEWS
Table post_views {
  post_id UUID [ref: > posts.id]
  user_id UUID [ref: > users.id]
  ip_address INET
  viewed_at TIMESTAMP [note: 'default: CURRENT_TIMESTAMP']
  Note: 'pk(post_id, user_id, ip_address)'
}
