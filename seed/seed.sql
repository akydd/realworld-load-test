-- Seed data for RealWorld load testing.
-- Safe to run multiple times: all inserts use ON CONFLICT DO NOTHING.
-- Password for all seed users: Password1!

BEGIN;

-- ============================================================
-- Users: 1000 seed users
-- ============================================================
INSERT INTO users (username, email, password)
SELECT
    'seed-user-' || gs.i,
    'seed-user-' || gs.i || '@example.com',
    '$argon2id$v=19$m=65536,t=1,p=8$C5XorK4bcG5Er8nPvlVVfg$y0O20krG/Wi2Ysz0M4rdwHupuLYeZmAOCEtwz44OOuw'
FROM generate_series(1, 1000) AS gs(i)
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE IF NOT EXISTS seed_users AS
SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS idx
FROM users
WHERE username LIKE 'seed-user-%';

-- ============================================================
-- Tags: 50 tags covering common topics
-- ============================================================
INSERT INTO tags (name) VALUES
    ('technology'),    ('programming'),    ('go'),             ('python'),         ('javascript'),
    ('typescript'),    ('rust'),           ('java'),           ('devops'),         ('cloud'),
    ('aws'),           ('gcp'),            ('azure'),          ('kubernetes'),     ('docker'),
    ('databases'),     ('postgresql'),     ('mysql'),          ('redis'),          ('mongodb'),
    ('microservices'), ('api'),            ('rest'),           ('graphql'),        ('machine-learning'),
    ('ai'),            ('data-science'),   ('web-development'),('frontend'),       ('backend'),
    ('mobile'),        ('ios'),            ('android'),        ('react'),          ('vue'),
    ('angular'),       ('node'),           ('startup'),        ('productivity'),   ('career'),
    ('tutorial'),      ('beginners'),      ('open-source'),    ('security'),       ('performance'),
    ('testing'),       ('architecture'),   ('design-patterns'),('agile'),          ('culture')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE IF NOT EXISTS seed_tags AS
SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS idx
FROM tags;

-- ============================================================
-- Articles: 10,000 articles spread over the past year
-- ============================================================
INSERT INTO articles (slug, title, description, body, author_id, created_at, updated_at)
SELECT
    'seed-article-' || gs.i,
    (ARRAY[
        'Getting Started with',
        'A Deep Dive into',
        'Why You Should Use',
        'The Future of',
        'Understanding',
        'Building with',
        'Mastering',
        'An Introduction to',
        'Tips and Tricks for',
        'The Complete Guide to'
    ])[(gs.i % 10) + 1]
    || ' '
    || initcap(replace(t.name, '-', ' ')),
    'Everything you need to know about ' || t.name || ', covered in depth.',
    repeat(
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '
        'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '
        'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip. '
        'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat. ',
        15
    ),
    u.id,
    NOW() - ((10000 - gs.i) * interval '52 minutes'),
    NOW() - ((10000 - gs.i) * interval '26 minutes')
FROM generate_series(1, 10000) AS gs(i)
JOIN seed_tags t ON t.idx = gs.i % (SELECT count(*)::int FROM seed_tags)
JOIN seed_users u ON u.idx = gs.i % (SELECT count(*)::int FROM seed_users)
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE IF NOT EXISTS seed_articles AS
SELECT id, (row_number() OVER (ORDER BY id) - 1)::int AS idx
FROM articles
WHERE slug LIKE 'seed-article-%';

-- ============================================================
-- Article tags: primary tag for every article, second tag for
-- every other article
-- ============================================================
INSERT INTO article_tags (article_id, tag_id)
SELECT a.id, t.id
FROM seed_articles a
JOIN seed_tags t ON t.idx = a.idx % (SELECT count(*)::int FROM seed_tags)
ON CONFLICT DO NOTHING;

INSERT INTO article_tags (article_id, tag_id)
SELECT a.id, t.id
FROM seed_articles a
JOIN seed_tags t ON t.idx = (a.idx + 7) % (SELECT count(*)::int FROM seed_tags)
WHERE a.idx % 2 = 0
ON CONFLICT DO NOTHING;

-- ============================================================
-- Follows: each user follows 10 others
-- Prime multipliers (7, 97) ensure even distribution across all users.
-- ============================================================
INSERT INTO follows (follower_id, followee_id)
SELECT DISTINCT u1.id, u2.id
FROM seed_users u1
CROSS JOIN generate_series(0, 9) AS gs(k)
JOIN seed_users u2 ON u2.idx = (u1.idx * 7 + gs.k * 97) % (SELECT count(*)::int FROM seed_users)
WHERE u1.id != u2.id
ON CONFLICT DO NOTHING;

-- ============================================================
-- Favorites: each user favorites 20 articles
-- Prime multipliers (17, 1009) ensure even distribution across all articles.
-- ============================================================
INSERT INTO article_favorites (user_id, article_id)
SELECT DISTINCT u.id, a.id
FROM seed_users u
CROSS JOIN generate_series(0, 19) AS gs(k)
JOIN seed_articles a ON a.idx = (u.idx * 17 + gs.k * 1009) % (SELECT count(*)::int FROM seed_articles)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Comments: 10,000 comments spread across articles
-- Multiplier 31 (prime) distributes comments across all articles.
-- ============================================================
INSERT INTO comments (body, author_id, article_id, created_at, updated_at)
SELECT
    'Seed comment ' || gs.i || ': really enjoyed reading this, thanks for sharing.',
    u.id,
    a.id,
    NOW() - (gs.i * interval '10 minutes'),
    NOW() - (gs.i * interval '10 minutes')
FROM generate_series(1, 10000) AS gs(i)
JOIN seed_users u ON u.idx =  gs.i      % (SELECT count(*)::int FROM seed_users)
JOIN seed_articles a ON a.idx = (gs.i * 31) % (SELECT count(*)::int FROM seed_articles);

COMMIT;
