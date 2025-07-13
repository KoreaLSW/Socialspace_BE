-- 여기의 테이블 생성 및 테이블 업데이트의 쿼리들은 내가 적용한 쿼리들입니다.
-- 여기의 쿼리를 참조해서 추후 CRUD를 작성할때 참조해주세요

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

SELECT * FROM words
where level = 4

SELECT * FROM users

DELETE FROM words;
ALTER SEQUENCE words_id_seq RESTART WITH 1;

ALTER TABLE user_words
RENAME COLUMN id TO user_words_id;

ALTER TABLE words
RENAME COLUMN kanji TO word; -- 'kanji' → 'word' (한자 단어)

ALTER TABLE words
RENAME COLUMN word_type TO part_of_speech; -- 'word_type' → 'part_of_speech' (품사)

COMMENT ON COLUMN user_words.user_words_id IS '기본 키 (자동 증가)';
COMMENT ON COLUMN user_words.user_id IS '사용자 ID (users 테이블과 연결)';
COMMENT ON COLUMN user_words.word_id IS '단어 ID (words 테이블과 연결)';
COMMENT ON COLUMN user_words.status IS '사용자가 외운 상태 (memorized: 외운 단어, notMemorized: 못 외운 단어)';
COMMENT ON COLUMN user_words.last_reviewed IS '마지막으로 학습한 날짜';

-- 1️⃣ 기존 PRIMARY KEY 제거
ALTER TABLE user_words DROP CONSTRAINT user_words_pkey;

-- 2️⃣ 복합 PRIMARY KEY 추가 (user_id + word_id)
ALTER TABLE user_words ADD PRIMARY KEY (user_id, word_id);

-- 3️⃣ 기존 id 컬럼 삭제 (필요한 경우)
ALTER TABLE user_words DROP COLUMN IF EXISTS user_words_id;

SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'user_words'::regclass;

CREATE TABLE user_words (
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE, -- 사용자 ID
  word_id TEXT NOT NULL REFERENCES words(word_id) ON DELETE CASCADE, -- 단어 ID
  status TEXT CHECK (status IN ('memorized', 'notMemorized')) NOT NULL DEFAULT 'notMemorized', -- 외운 상태
  last_reviewed TIMESTAMP DEFAULT NOW(), -- 마지막 학습 날짜
  PRIMARY KEY (user_id, word_id) -- 복합 PK (같은 단어에 대한 중복 저장 방지)
);

ALTER TABLE words
ADD COLUMN stars INTEGER DEFAULT 0
CHECK (stars BETWEEN 0 AND 5);


-- 기존 테이블 백업 (안전을 위해)
CREATE TABLE IF NOT EXISTS words_backup AS SELECT * FROM words;

DELETE FROM words;

ALTER TABLE words DROP CONSTRAINT words_level_check;

-- 2. '기타'를 포함한 새로운 CHECK 제약조건 추가
ALTER TABLE words
ADD CONSTRAINT words_level_check
CHECK (level = ANY (ARRAY['N1', 'N2', 'N3', 'N4', 'N5', '기타']));

ALTER TABLE public.words DROP CONSTRAINT words_pkey;
ALTER TABLE public.words DROP COLUMN word_id;

-- 1. 외래 키 제약조건 제거 (user_words 테이블)
ALTER TABLE public.user_words DROP CONSTRAINT user_words_word_id_fkey;

-- 2. words 테이블 수정
ALTER TABLE public.words DROP CONSTRAINT words_pkey;
ALTER TABLE public.words DROP COLUMN word_id;

ALTER TABLE public.words
ADD COLUMN word_id TEXT NOT NULL PRIMARY KEY;

-- 3. 외래 키 제약 다시 추가
ALTER TABLE public.user_words
ADD CONSTRAINT user_words_word_id_fkey
FOREIGN KEY (word_id)
REFERENCES public.words (word_id)
ON DELETE CASCADE;

SELECT * FROM public.words;

-- 단어 컬럼에 인덱스 추가
CREATE INDEX idx_words_word ON words(word);

-- 읽기 컬럼에 인덱스 추가
CREATE INDEX idx_words_reading ON words(reading);

-- 의미 검색을 위한 GIN 인덱스 (JSON/배열 데이터용)
CREATE INDEX idx_words_meanings ON words USING GIN (meanings);

-----

-- 전체 텍스트 검색을 위한 컬럼 추가
ALTER TABLE words ADD COLUMN search_vector tsvector;

-- 검색 벡터 업데이트
UPDATE words SET search_vector = 
  setweight(to_tsvector('simple', coalesce(word,'')), 'A') ||
  setweight(to_tsvector('simple', coalesce(reading,'')), 'B') ||
  setweight(to_tsvector('simple', coalesce(array_to_string(meanings, ' '),'')), 'C');

-- 트리거 생성 (데이터 업데이트시 자동으로 검색 벡터 업데이트)
CREATE FUNCTION words_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('simple', coalesce(NEW.word,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.reading,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(array_to_string(NEW.meanings, ' '),'')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER words_search_vector_update_trigger
BEFORE INSERT OR UPDATE ON words
FOR EACH ROW EXECUTE FUNCTION words_search_vector_update();

-- 검색 벡터에 GIN 인덱스 추가
CREATE INDEX idx_words_search_vector ON words USING GIN (search_vector);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

SELECT 
  word_id,
  unnest(meanings) AS meaning,
  similarity(unnest(meanings), '복숭아') AS sim
FROM words
WHERE EXISTS (
  SELECT 1
  FROM unnest(meanings) AS m
  WHERE m % '복숭아'
)
ORDER BY sim DESC
LIMIT 10;

SELECT *
FROM words
WHERE search_vector @@ plainto_tsquery('나무')
ORDER BY ts_rank(search_vector, plainto_tsquery('나무')) DESC
LIMIT 10;

SELECT
          w.word_id,
          w.word,
          w.reading,
          w.meanings,
          w.level,
          w.part_of_speech,
          COALESCE(uw.status, NULL) as status
        FROM words w
        LEFT JOIN user_words uw ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
        WHERE w.search_vector @@ plainto_tsquery('simple', '종이')

        ORDER BY
          GREATEST(similarity(w.word, '종이'), similarity(w.reading, '종이')) DESC,
          ts_rank(w.search_vector, plainto_tsquery('simple', '종이')) DESC
        LIMIT 10 OFFSET 0

SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.part_of_speech
FROM public.words w
WHERE
  w.search_vector @@ phraseto_tsquery('simple', '종이')
ORDER BY
  ts_rank(w.search_vector, phraseto_tsquery('simple', '종이')) DESC,
  GREATEST(
    similarity(w.word, '종이'),
    similarity(w.reading, '종이'),
    similarity(array_to_string(w.meanings, ' '), '종이')  -- 별도 컬럼 없이 유사도 비교
  ) DESC
LIMIT 10;

SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.part_of_speech,
  COALESCE(uw.status, NULL) AS status,
  GREATEST(
    similarity(w.word, '사과'),
    similarity(w.reading, '사과'),
    similarity(array_to_string(w.meanings, ' '), '사과')
  ) AS sim_score
FROM words w
LEFT JOIN user_words uw ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
WHERE EXISTS (
  SELECT 1 FROM unnest(w.meanings) AS m WHERE m ILIKE '%사과%'
)
ORDER BY
  -- 유사도 + 별점(가중치 0.2) + JLPT 우선도 점수 조합
  GREATEST(
    similarity(w.word, '사과'),
    similarity(w.reading, '사과'),
    similarity(array_to_string(w.meanings, ' '), '사과')
  ) * 0.8
  + LEAST(w.stars, 5) * 0.2 DESC,
  w.level ASC
LIMIT 20;



SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.part_of_speech,
  COALESCE(uw.status, NULL) AS status,
  -- 검색 관련성 점수 계산
  CASE
    WHEN w.word = '종이' THEN 100  -- 단어 완전 일치
    WHEN w.reading = '종이' THEN 90  -- 읽기 완전 일치
    WHEN w.word ILIKE '종이%' THEN 80  -- 단어 시작 일치
    WHEN w.reading ILIKE '종이%' THEN 70  -- 읽기 시작 일치
    WHEN w.word ILIKE '%종이%' THEN 60  -- 단어 부분 포함
    WHEN w.reading ILIKE '%종이%' THEN 50  -- 읽기 부분 포함
    WHEN w.meanings::text ILIKE '%종이%' THEN 40  -- 뜻 안에 포함
    ELSE 30  -- 전체 텍스트 검색 일치
  END AS score
FROM words w
LEFT JOIN user_words uw ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
WHERE
  w.word = '종이' OR
  w.reading = '종이' OR
  w.word ILIKE '종이%' OR
  w.reading ILIKE '종이%' OR
  w.word ILIKE '%종이%' OR
  w.reading ILIKE '%종이%' OR
  w.meanings::text ILIKE '%종이%' OR
  w.search_vector @@ plainto_tsquery('simple', '종이')
ORDER BY
  score DESC,
  LENGTH(w.word) ASC,
  w.word ASC
LIMIT 20 OFFSET 0;

SELECT *
FROM words
WHERE EXISTS (
  SELECT 1 FROM unnest(meanings) AS m WHERE m ILIKE '종이.'
);

SELECT * FROM words WHERE word = '紙'

SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.stars
FROM words w
WHERE
  w.search_vector @@ plainto_tsquery('simple', '지우개')
ORDER BY
  ABS(CHAR_LENGTH(w.word) - CHAR_LENGTH('지우개')) ASC,  -- 1. 검색어와 글자 수 차이 적은 순
  CASE w.level                                            -- 2. JLPT 레벨 순서
    WHEN 'N5' THEN 1
    WHEN 'N4' THEN 2
    WHEN 'N3' THEN 3
    WHEN 'N2' THEN 4
    WHEN 'N1' THEN 5
    ELSE 6
  END,
  w.stars DESC                                            -- 3. 별점 높은 순
LIMIT 20;


SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.stars,
  -- 정확도 점수 계산
  CASE
    WHEN w.word = '사과' THEN 100
    WHEN w.reading = '사과' THEN 90
    WHEN w.word ILIKE '사과%' THEN 80
    WHEN w.reading ILIKE '사과%' THEN 70
    WHEN w.word ILIKE '%사과%' THEN 60
    WHEN w.reading ILIKE '%사과%' THEN 50
    WHEN array_to_string(w.meanings, ' ') ILIKE '%사과%' THEN 40
    ELSE 30
  END AS score
FROM words w
WHERE
  w.search_vector @@ plainto_tsquery('simple', '사과')
ORDER BY
  score DESC,  -- 정확도 높은 것 먼저
  CASE w.level
    WHEN 'N5' THEN 1
    WHEN 'N4' THEN 2
    WHEN 'N3' THEN 3
    WHEN 'N2' THEN 4
    WHEN 'N1' THEN 5
    ELSE 6
  END,
  w.stars DESC,
  length(w.word) ASC
LIMIT 20;

SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.part_of_speech,
  COALESCE(uw.status, NULL) AS status,
  -- 정확도 점수 계산
  CASE
    WHEN w.word = '사과' THEN 100  -- 단어 완전 일치
    WHEN w.reading = '사과' THEN 90  -- 읽기 완전 일치
    WHEN w.word ILIKE '사과%' THEN 80  -- 단어 시작 부분 일치
    WHEN w.reading ILIKE '사과%' THEN 70  -- 읽기 시작 부분 일치
    WHEN w.word ILIKE '%사과%' THEN 60  -- 단어 부분 일치
    WHEN w.reading ILIKE '%사과%' THEN 50  -- 읽기 부분 일치
    WHEN array_to_string(w.meanings, ' ') ILIKE '%사과%' THEN 40  -- 의미 부분 일치
    ELSE 30  -- 전체 텍스트 검색 일치
  END AS score
FROM words w
LEFT JOIN user_words uw ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
WHERE
  w.search_vector @@ plainto_tsquery('simple', '사과')
ORDER BY
  score DESC,
  CASE w.level
    WHEN 'N5' THEN 1
    WHEN 'N4' THEN 2
    WHEN 'N3' THEN 3
    WHEN 'N2' THEN 4
    WHEN 'N1' THEN 5
    ELSE 6
  END,
  length(w.word) ASC
LIMIT 20 OFFSET 0;


SELECT
  w.word_id,
  w.word,
  w.reading,
  w.meanings,
  w.level,
  w.part_of_speech,
  COALESCE(uw.status, NULL) AS status,
  -- 정확도 점수 계산
  CASE
    WHEN w.word = '코끼리' THEN 100  -- 단어 완전 일치
    WHEN w.reading = '코끼리' THEN 90  -- 읽기 완전 일치
    WHEN w.word ILIKE '코끼리%' THEN 80  -- 단어 시작 부분 일치
    WHEN w.reading ILIKE '코끼리%' THEN 70  -- 읽기 시작 부분 일치
    WHEN w.word ILIKE '%코끼리%' THEN 60  -- 단어 포함
    WHEN w.reading ILIKE '%코끼리%' THEN 50
    WHEN array_to_string(w.meanings, ' ') ILIKE '%코끼리%' THEN 40  -- 의미 포함
    ELSE 30  -- 그 외 (전체 텍스트 매칭)
  END AS score
FROM words w
LEFT JOIN user_words uw
  ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
WHERE
  w.search_vector @@ plainto_tsquery('simple', '코끼리')  -- 전체 텍스트 검색 필터

ORDER BY
  score DESC,  -- 점수 기준 정렬 (완전일치 우선)
  CASE w.level
    WHEN 'N5' THEN 1
    WHEN 'N4' THEN 2
    WHEN 'N3' THEN 3
    WHEN 'N2' THEN 4
    WHEN 'N1' THEN 5
    ELSE 6
  END,
  LENGTH(w.word) ASC  -- 동일 점수 내에서는 짧은 단어 우선
LIMIT 20 OFFSET 0;



CREATE INDEX idx_words_level_length_word ON words(level, length(word), word);
CREATE INDEX IF NOT EXISTS idx_words_level ON words(level);
CREATE INDEX IF NOT EXISTS idx_user_words_user_status ON user_words(user_id, status);
CREATE INDEX IF NOT EXISTS idx_words_quiz ON words(level, meanings);

SELECT
        w.word_id,
        w.word,
        w.reading,
        w.meanings,
        w.level,
        w.part_of_speech
      FROM words w
      WHERE w.meanings IS NOT NULL AND array_length(w.meanings, 1) > 0

      AND w.word IS NOT NULL
      AND length(w.word) > 0

      ORDER BY random()
      LIMIT 10

	  CREATE MATERIALIZED VIEW valid_words_for_quiz AS
SELECT *
FROM words
WHERE 
  meanings IS NOT NULL AND array_length(meanings, 1) > 0
  AND word IS NOT NULL AND length(word) > 0;

  SELECT *
FROM valid_words_for_quiz
ORDER BY random()
LIMIT 10;


INSERT INTO user_words (user_id, word_id, status, last_reviewed)
SELECT
  'dmememrb',            -- 👈 여기에 사용자 ID 직접 넣으세요
  w.word_id,
  'memorized',
  timezone('Asia/Seoul', now())
FROM words w
WHERE w.level = 'N5'
  AND NOT EXISTS (
    SELECT 1
    FROM user_words uw
    WHERE uw.user_id = 'dmememrb'
      AND uw.word_id = w.word_id
  );

   SELECT
        w.word_id,
        w.word,
        w.reading,
        w.meanings,
        w.level,
        w.part_of_speech
      FROM words w
      LEFT JOIN user_words uw ON w.word_id = uw.word_id AND uw.user_id = 'dmememrb'
      WHERE w.meanings IS NOT NULL AND array_length(w.meanings, 1) > 0
      AND uw.status IS NULL  -- 아직 학습하지 않은 단어만 선택

        AND w.word IS NOT NULL
        AND length(w.word) > 0
         AND w.level = 'N5'
      ORDER BY random()
      LIMIT '5'

ALTER TABLE users
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;