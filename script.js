import http from 'k6/http';
import { sleep, check } from 'k6';
import { SharedArray } from 'k6/data';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8090';

// Seed data created during setup, shared across all VUs
const state = new SharedArray('state', function () { return [{}]; });

export const options = {
  scenarios: {
    // Most traffic: anonymous users browsing articles
    anonymous_reader: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1m',
      duration: __ENV.DURATION || '1h',
      preAllocatedVUs: 10,
      maxVUs: 20,
      exec: 'anonymousReader',
    },
    // Authenticated users reading their feed and profiles
    authenticated_reader: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1m',
      duration: __ENV.DURATION || '1h',
      preAllocatedVUs: 5,
      maxVUs: 10,
      exec: 'authenticatedReader',
    },
    // Small cohort creating articles, comments, and favorites
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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Token ${token}`;
  return { headers };
}

function register(username, email, password) {
  const res = http.post(
    `${BASE_URL}/api/users`,
    JSON.stringify({ user: { username, email, password } }),
    jsonHeaders(),
  );
  check(res, { 'register 201': (r) => r.status === 201 });
  return res.status === 201 ? res.json('user.token') : null;
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

function getSlugs() {
  const res = http.get(`${BASE_URL}/api/articles?limit=20`, jsonHeaders());
  if (res.status !== 200) return [];
  return (res.json('articles') || []).map((a) => a.slug);
}

// --- Setup: seed users and articles so readers have something to find ---

export function setup() {
  const password = 'Password1!';

  // Seed author
  const authorId = uid();
  const authorEmail = `author-${authorId}@example.com`;
  const authorToken = register(`author-${authorId}`, authorEmail, password);

  // Seed reader (for authenticated_reader scenario)
  const readerId = uid();
  const readerEmail = `reader-${readerId}@example.com`;
  register(`reader-${readerId}`, readerEmail, password);

  // Seed articles
  const slugs = [];
  if (authorToken) {
    const tags = ['tech', 'go', 'cloud', 'devops', 'postgres'];
    for (let i = 0; i < 20; i++) {
      const id = uid();
      const res = http.post(
        `${BASE_URL}/api/articles`,
        JSON.stringify({
          article: {
            title: `Seed Article ${id}`,
            description: 'A seeded article for load testing.',
            body: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20),
            tagList: [tags[i % tags.length]],
          },
        }),
        jsonHeaders(authorToken),
      );
      if (res.status === 201) slugs.push(res.json('article.slug'));
    }
  }

  return {
    readerEmail,
    readerPassword: password,
    authorEmail,
    authorPassword: password,
    slugs,
  };
}

// --- Scenarios ---

export function anonymousReader(data) {
  const slugs = data.slugs.length > 0 ? data.slugs : getSlugs();

  // Weighted action: 70% list, 30% read specific article
  if (Math.random() < 0.7) {
    const tags = ['tech', 'go', 'cloud', 'devops', 'postgres'];
    const tag = tags[Math.floor(Math.random() * tags.length)];
    const res = http.get(`${BASE_URL}/api/articles?tag=${tag}&limit=10`, jsonHeaders());
    check(res, { 'list articles 200': (r) => r.status === 200 });
  } else if (slugs.length > 0) {
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    const res = http.get(`${BASE_URL}/api/articles/${slug}`, jsonHeaders());
    check(res, { 'get article 200': (r) => r.status === 200 });

    // Also fetch comments while reading an article
    const commentsRes = http.get(`${BASE_URL}/api/articles/${slug}/comments`, jsonHeaders());
    check(commentsRes, { 'get comments 200': (r) => r.status === 200 });
  }

  sleep(1 + Math.random() * 4);
}

export function authenticatedReader(data) {
  const token = login(data.readerEmail, data.readerPassword);
  if (!token) return;

  const slugs = data.slugs.length > 0 ? data.slugs : getSlugs();

  // Read feed
  const feedRes = http.get(`${BASE_URL}/api/articles/feed?limit=10`, jsonHeaders(token));
  check(feedRes, { 'feed 200': (r) => r.status === 200 });

  // Favorite a random article
  if (slugs.length > 0) {
    const slug = slugs[Math.floor(Math.random() * slugs.length)];
    const favRes = http.post(`${BASE_URL}/api/articles/${slug}/favorite`, null, jsonHeaders(token));
    check(favRes, { 'favorite 200': (r) => r.status === 200 });
  }

  sleep(2 + Math.random() * 8);
}

export function contentCreator(data) {
  // Each content creator VU registers a fresh user so writes don't collide
  const id = uid();
  const email = `creator-${id}@example.com`;
  const token = register(`creator-${id}`, email, 'Password1!');
  if (!token) return;

  // Create an article
  const tags = ['tech', 'go', 'cloud', 'devops', 'postgres'];
  const articleRes = http.post(
    `${BASE_URL}/api/articles`,
    JSON.stringify({
      article: {
        title: `Load Test Article ${id}`,
        description: 'Generated by load test.',
        body: 'Lorem ipsum dolor sit amet. '.repeat(30),
        tagList: [tags[Math.floor(Math.random() * tags.length)]],
      },
    }),
    jsonHeaders(token),
  );
  check(articleRes, { 'create article 201': (r) => r.status === 201 });

  // Comment on a seed article
  const slugs = data.slugs.length > 0 ? data.slugs : getSlugs();
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
