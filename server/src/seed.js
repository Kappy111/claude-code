// Seeds OmniFeed with demo users and content across all four formats.
// CLI:  npm run seed   → resets demo data (destructive)
// Boot: runSeed()      → seeds ONCE only if the database is empty (safe in production)
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db, initSchema, ensureBucket } from './db.js';
import { svgImage, svgAvatar, makeVideo, FFMPEG_AVAILABLE } from './gen-assets.js';

// Removes the built-in demo accounts (and, via ON DELETE CASCADE, all their
// posts/comments/likes/etc.). Demo users are the only ones with @omnifeed.app
// emails; real sign-ups use real emails, so this never touches them.
export async function purgeDemoData() {
  const { changes } = await db.prepare("DELETE FROM users WHERE email LIKE '%@omnifeed.app'").run();
  return changes || 0;
}

// Grants the verified badge to the owner account named by OMNIFEED_OWNER_USERNAME.
// Idempotent and safe to run on every boot.
export async function applyOwnerBadge() {
  const owner = process.env.OMNIFEED_OWNER_USERNAME;
  if (!owner) return 0;
  const { changes } = await db.prepare('UPDATE users SET verified = 1 WHERE LOWER(username) = LOWER(?)').run(owner);
  return changes || 0;
}

export async function runSeed({ reset = false } = {}) {
  await initSchema();
  await ensureBucket();

  // Keep the public app clean: always strip demo content on boot.
  const purged = await purgeDemoData();
  if (purged) console.log(`Removed ${purged} demo account(s) and their content.`);

  const existing = (await db.prepare('SELECT COUNT(*)::int n FROM users').get()).n;
  if (!reset && existing > 0) return { skipped: true, users: existing };
  // Only seed demo content for local dev (CLI reset) or when explicitly opted in.
  // The public app stays empty so real users post the first content.
  if (!reset && process.env.OMNIFEED_SEED_DEMO !== '1') return { skipped: true, users: existing };

  const PASSWORD = bcrypt.hashSync('password', 10);
  let asset = 0;

  if (reset) {
    await db.exec(`
      DELETE FROM notifications; DELETE FROM watch_history; DELETE FROM bookmarks;
      DELETE FROM likes; DELETE FROM comments; DELETE FROM follows; DELETE FROM messages; DELETE FROM posts; DELETE FROM users;
    `);
  }

  console.log(FFMPEG_AVAILABLE ? 'Seeding demo content (ffmpeg available)…' : 'Seeding demo content (SVG media)…');

  const users = [
    { username: 'aria', display: 'Aria Nakamura', bio: 'Design systems & slow mornings. Building OmniFeed ✦', verified: 1 },
    { username: 'kai', display: 'Kai Rivera', bio: 'Street photography / film grain / coffee', verified: 0 },
    { username: 'luna', display: 'Luna Park', bio: 'Short films & big ideas 🎬', verified: 1 },
    { username: 'devon', display: 'Devon Cole', bio: 'Thoughts, mostly. Sometimes threads.', verified: 0 },
    { username: 'mira', display: 'Mira Okafor', bio: 'Dance • motion • vertical video', verified: 1 },
    { username: 'theo', display: 'Theo Lindqvist', bio: 'Long-form essays on tech + culture', verified: 0 },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, username, display_name, email, password_hash, auth_provider, profile_image, bio, verified)
    VALUES (@id, @username, @display, @email, @ph, 'email', @img, @bio, @verified)
  `);
  const ids = {};
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    const id = nanoid();
    ids[u.username] = id;
    const initials = u.display.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    await insertUser.run({ id, username: u.username, display: u.display, email: `${u.username}@omnifeed.app`,
      ph: PASSWORD, img: await svgAvatar(initials, i), bio: u.bio, verified: u.verified });
  }

  const insertPost = db.prepare(`
    INSERT INTO posts (id, user_id, post_type, text, caption, title, description, media, thumbnail_url,
      hashtags, audio_info, chapters, tags, created_at, view_count, duration)
    VALUES (@id, @user_id, @type, @text, @caption, @title, @description, @media, @thumb,
      @hashtags, @audio, @chapters, @tags, now() + (@age)::interval, @views, @duration)
  `);

  let clock = 0;
  const nextAge = () => `-${(clock += Math.floor(Math.random() * 180) + 20)} minutes`;
  const tags = (...t) => JSON.stringify(t);
  const photo = (label) => svgImage(label, asset++, 900, 1125);
  const img3 = (...labels) => Promise.all(labels.map(async (l) => ({ url: await photo(l), type: 'image' })));

  async function post(username, data) {
    const id = nanoid();
    await insertPost.run({
      id, user_id: ids[username], type: data.type,
      text: data.text || null, caption: data.caption || null, title: data.title || null,
      description: data.description || null, media: JSON.stringify(data.media || []), thumb: data.thumb || null,
      hashtags: tags(...(data.hashtags || [])), audio: data.audio || null,
      chapters: JSON.stringify(data.chapters || []), tags: JSON.stringify(data.vtags || []),
      age: nextAge(), views: Math.floor(Math.random() * 40000), duration: data.duration || 0,
    });
    return id;
  }

  const postIds = [];
  postIds.push(await post('kai', { type: 'snap', caption: 'Golden hour on 7th street 🌇', media: await img3('Golden Hour', 'Dusk', '7th St'), hashtags: ['streetphotography', 'goldenhour'] }));
  postIds.push(await post('aria', { type: 'snap', caption: 'Moodboard for the new OmniFeed palette.', media: await img3('Palette', 'Tokens'), hashtags: ['design', 'ui'] }));
  postIds.push(await post('mira', { type: 'snap', caption: 'Backstage before the show ✨', media: await img3('Backstage'), hashtags: ['dance', 'backstage'] }));
  postIds.push(await post('luna', { type: 'snap', caption: 'Location scouting. Which frame?', media: await img3('Frame 01', 'Frame 02', 'Frame 03', 'Frame 04'), hashtags: ['film', 'cinematography'] }));

  postIds.push(await post('devon', { type: 'thought', text: 'The best feature of a social app is the one you never notice. Friction is the real algorithm.', hashtags: ['product'] }));
  postIds.push(await post('aria', { type: 'thought', text: 'Dark mode is not a color scheme. It is a posture.', hashtags: ['design'] }));
  postIds.push(await post('theo', { type: 'thought', text: 'Hot take: the feed should feel like a mixtape, not a slot machine.', hashtags: ['tech', 'culture'] }));
  postIds.push(await post('kai', { type: 'thought', text: 'Shot 4 rolls today. Developing tomorrow. The waiting is the best part.' }));

  async function short(username, label, caption, audio, hashtags) {
    const { url, duration } = await makeVideo(label, asset++, { vertical: true, seconds: 10 + Math.floor(Math.random() * 20) });
    return post(username, { type: 'short', caption, media: [{ url, type: 'video' }], thumb: await svgImage(label, asset++, 720, 1280), audio, hashtags, duration });
  }
  postIds.push(await short('mira', 'Combo Drill', '30-second combo drill 💃 save this one', 'original sound — mira', ['dance', 'tutorial']));
  postIds.push(await short('luna', 'The Shot', 'POV: the shot finally lands', 'cinematic ambient', ['filmmaking', 'bts']));
  postIds.push(await short('kai', 'City 15s', 'city in 15 seconds', 'lofi beats', ['city', 'timelapse']));
  postIds.push(await short('mira', 'Freestyle', 'warmup → freestyle', 'original sound — mira', ['freestyle']));
  postIds.push(await short('aria', 'Micro-interactions', 'micro-interactions that spark joy', 'ui sounds', ['design', 'motion']));

  async function video(username, title, description, hashtags, chapters, vtags) {
    const { url, duration } = await makeVideo(title, asset++, { vertical: false, seconds: 14 });
    return post(username, { type: 'video', title, description, media: [{ url, type: 'video' }],
      thumb: await svgImage(title, asset++, 1280, 720), hashtags, chapters, vtags, duration: duration || (300 + Math.floor(Math.random() * 900)) });
  }
  postIds.push(await video('luna', 'Making a short film with no budget (full process)',
    'From script to final cut — every step of producing a short film solo. Gear list and timeline in the description.',
    ['filmmaking'], [{ time: 0, label: 'Intro' }, { time: 45, label: 'Script' }, { time: 150, label: 'Shooting' }, { time: 320, label: 'Editing' }],
    ['film', 'tutorial', 'behind the scenes']));
  postIds.push(await video('theo', 'Why social media feels broken (video essay)',
    'A 10-minute essay on attention, incentives, and what a healthier feed could look like.',
    ['tech', 'essay'], [{ time: 0, label: 'The problem' }, { time: 120, label: 'Incentives' }, { time: 300, label: 'A better way' }],
    ['essay', 'technology']));
  postIds.push(await video('aria', 'Designing OmniFeed: the dark-first design system',
    'A walkthrough of the tokens, components, and motion principles behind OmniFeed.',
    ['design', 'designsystems'], [], ['design', 'ui', 'walkthrough']));

  const follow = db.prepare("INSERT INTO follows (follower_id, following_id, status) VALUES (?,?,'active') ON CONFLICT DO NOTHING");
  const names = Object.keys(ids);
  for (const a of names) for (const b of names) if (a !== b && Math.random() < 0.55) await follow.run(ids[a], ids[b]);

  const like = db.prepare('INSERT INTO likes (id, post_id, user_id) VALUES (?,?,?) ON CONFLICT DO NOTHING');
  const comment = db.prepare('INSERT INTO comments (id, post_id, user_id, text) VALUES (?,?,?,?)');
  const sampleComments = ['This is incredible 🔥', 'Saving this immediately', 'How did you shoot this?', 'Underrated post', 'Teach me your ways', 'The palette though 😍', 'Instant follow'];
  for (const pid of postIds) for (const u of names) {
    if (Math.random() < 0.5) await like.run(nanoid(), pid, ids[u]);
    if (Math.random() < 0.25) await comment.run(nanoid(), pid, ids[u], sampleComments[Math.floor(Math.random() * sampleComments.length)]);
  }

  const t1 = await post('devon', { type: 'thought', text: 'A thread on building OmniFeed 🧵 (1/3)' });
  const ins = db.prepare("INSERT INTO posts (id, user_id, post_type, text, parent_post_id, hashtags, created_at) VALUES (?,?,?,?,?,?, now() + (?)::interval)");
  await ins.run(nanoid(), ids.devon, 'thought', 'First: one account, four formats. No more app-switching. (2/3)', t1, '[]', '-10 minutes');
  await ins.run(nanoid(), ids.devon, 'thought', 'Second: the feed interleaves formats so it feels like a mixtape. (3/3)', t1, '[]', '-5 minutes');

  const notif = db.prepare('INSERT INTO notifications (id, recipient_id, sender_id, notification_type, post_id) VALUES (?,?,?,?,?)');
  await notif.run(nanoid(), ids.aria, ids.kai, 'follow', null);
  await notif.run(nanoid(), ids.aria, ids.luna, 'like', postIds[1]);
  await notif.run(nanoid(), ids.aria, ids.mira, 'comment', postIds[1]);

  console.log(`Seeded ${names.length} users and ${postIds.length}+ posts.`);
  return { skipped: false, users: names.length, posts: postIds.length };
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('seed.js');
if (invokedDirectly) {
  runSeed({ reset: true }).then(() => {
    console.log('Demo login → username: aria   password: password');
    process.exit(0);
  }).catch((e) => { console.error(e); process.exit(1); });
}
