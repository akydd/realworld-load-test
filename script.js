import http from 'k6/http';
import { sleep, check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8090';

const SEED_USER_COUNT = 1000;
const PASSWORD = 'Password1!';
const TAGS = [
  'technology', 'programming', 'go', 'python', 'javascript',
  'typescript', 'rust', 'java', 'devops', 'cloud',
  'aws', 'gcp', 'azure', 'kubernetes', 'docker',
  'databases', 'postgresql', 'mysql', 'redis', 'mongodb',
  'microservices', 'api', 'rest', 'graphql', 'machine-learning',
  'ai', 'data-science', 'web-development', 'frontend', 'backend',
  'mobile', 'ios', 'android', 'react', 'vue',
  'angular', 'node', 'startup', 'productivity', 'career',
  'tutorial', 'beginners', 'open-source', 'security', 'performance',
  'testing', 'architecture', 'design-patterns', 'agile', 'culture',
];

export const options = {
  scenarios: {
    // Dominant traffic: anonymous users browsing and reading
    anonymous_reader: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1m',
      duration: __ENV.DURATION || '1h',
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'anonymousReader',
    },
    // Authenticated users checking their feed and favoriting articles
    authenticated_reader: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1m',
      duration: __ENV.DURATION || '1h',
      preAllocatedVUs: 5,
      maxVUs: 10,
      exec: 'authenticatedReader',
    },
    // Small cohort publishing articles and leaving comments
    content_creator: {
      executor: 'constant-arrival-rate',
      rate: 5,
      timeUnit: '1m',
      duration: __ENV.DURATION || '1h',
      preAllocatedVUs: 2,
      maxVUs: 5,
      exec: 'contentCreator',
    },
  },
};

// --- Helpers ---

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Token ${token}`;
  return { headers: h };
}

function randomTag() {
  return TAGS[Math.floor(Math.random() * TAGS.length)];
}

// Pick a random seeded user by index.
function randomSeedUser() {
  const i = Math.floor(Math.random() * SEED_USER_COUNT) + 1;
  return { email: `seed-user-${i}@example.com`, password: PASSWORD };
}

function login(email, password) {
  const res = http.post(
    `${BASE_URL}/api/users/login`,
    JSON.stringify({ user: { email, password } }),
    jsonHeaders(),
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  return res.status === 200 ? res.json('user.token') : null;
}

// Fetch a page of article slugs, optionally filtered by tag.
function getSlugs(tag) {
  const url = tag
    ? `${BASE_URL}/api/articles?tag=${encodeURIComponent(tag)}&limit=20`
    : `${BASE_URL}/api/articles?limit=20`;
  const res = http.get(url, jsonHeaders());
  if (res.status !== 200) return [];
  return (res.json('articles') || []).map((a) => a.slug);
}

// --- Scenarios ---

export function anonymousReader() {
  if (Math.random() < 0.7) {
    // Browse articles by tag
    const res = http.get(
      `${BASE_URL}/api/articles?tag=${encodeURIComponent(randomTag())}&limit=10`,
      jsonHeaders(),
    );
    check(res, { 'list articles 200': (r) => r.status === 200 });
  } else {
    // Read a specific article and its comments
    const slugs = getSlugs(randomTag());
    if (slugs.length > 0) {
      const slug = slugs[Math.floor(Math.random() * slugs.length)];

      const articleRes = http.get(`${BASE_URL}/api/articles/${slug}`, jsonHeaders());
      check(articleRes, { 'get article 200': (r) => r.status === 200 });

      const commentsRes = http.get(`${BASE_URL}/api/articles/${slug}/comments`, jsonHeaders());
      check(commentsRes, { 'get comments 200': (r) => r.status === 200 });
    }
  }

  sleep(1 + Math.random() * 4);
}

export function authenticatedReader() {
  const user = randomSeedUser();
  const token = login(user.email, user.password);
  if (!token) return;

  const feedRes = http.get(`${BASE_URL}/api/articles/feed?limit=10`, jsonHeaders(token));
  check(feedRes, { 'feed 200': (r) => r.status === 200 });

  // Favorite a random article from the current tag listing
  const slugs = getSlugs(randomTag());
  if (slugs.length > 0) {
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    const favRes = http.post(
      `${BASE_URL}/api/articles/${slug}/favorite`,
      null,
      jsonHeaders(token),
    );
    check(favRes, { 'favorite 200': (r) => r.status === 200 });
  }

  sleep(2 + Math.random() * 8);
}

export function contentCreator() {
  // Each invocation registers a fresh user so writes don't collide
  const id = uid();
  const regRes = http.post(
    `${BASE_URL}/api/users`,
    JSON.stringify({ user: { username: `creator-${id}`, email: `creator-${id}@example.com`, password: PASSWORD } }),
    jsonHeaders(),
  );
  check(regRes, { 'register 201': (r) => r.status === 201 });
  const token = regRes.status === 201 ? regRes.json('user.token') : null;
  if (!token) return;

  // Publish an article
  const articleRes = http.post(
    `${BASE_URL}/api/articles`,
    JSON.stringify({
      article: {
        title: `Load Test Article ${id}`,
        description: 'Generated by load test.',
        body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30),
        tagList: [randomTag()],
      },
    }),
    jsonHeaders(token),
  );
  check(articleRes, { 'create article 201': (r) => r.status === 201 });

  // Comment on an existing seed article
  const slugs = getSlugs(randomTag());
  if (slugs.length > 0) {
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    const commentRes = http.post(
      `${BASE_URL}/api/articles/${slug}/comments`,
      JSON.stringify({ comment: { body: `Load test comment from ${id}.` } }),
      jsonHeaders(token),
    );
    check(commentRes, { 'create comment 201': (r) => r.status === 201 });
  }

  sleep(5 + Math.random() * 10);
}
