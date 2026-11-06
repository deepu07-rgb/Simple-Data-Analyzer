// "Ask in your own words": a question is matched to the columns and values of the open file and to one tool.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sandbox } = require('./load');
const ctx = sandbox(['web/js/tasks/28-lexicon.js', 'web/js/tasks/29-csv-parse.js', 'web/js/tasks/30-messy-file-fixer.js', 'web/js/tasks/31-merge-anything.js', 'web/js/reports/41-pendency-radar.js', 'web/js/charts/60-chart-engine.js', 'web/js/charts/65-fair-compare.js', 'web/js/charts/66-drivers.js', 'web/js/tasks/37-derive.js', 'web/js/tasks/38-ask.js']);
const A = ctx.STL.ask, plain = x => JSON.parse(JSON.stringify(x));
const H = ['Student_ID', 'Major_Category', 'Year_of_Study', 'Pre_Semester_GPA', 'Weekly_GenAI_Hours', 'Primary_Use_Case', 'Prompt_Engineering_Skill', 'Tool_Diversity', 'Paid_Subscription', 'Traditional_Study_Hours', 'Perceived_AI_Dependency', 'Institutional_Policy', 'Anxiety_Level_During_Exams', 'Post_Semester_GPA', 'Skill_Retention_Score', 'Burnout_Risk_Level'];
let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }, pick = a => a[Math.floor(rnd() * a.length)];
const rows = Array.from({ length: 1500 }, (_, i) => { const pre = 2 + 2 * rnd(); return [String(100001 + i), pick(['STEM', 'Business', 'Humanities', 'Medical', 'Arts']), pick(['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']), pre.toFixed(3), (rnd() * 30).toFixed(2), pick(['Debugging/Troubleshooting', 'Copywriting/Drafting', 'Ideation', 'Summarizing_Reading', 'Direct_Answer_Generation']), pick(['Beginner', 'Intermediate', 'Advanced']), String(1 + Math.floor(rnd() * 5)), pick(['True', 'False']), (3 + 12 * rnd()).toFixed(2), String(1 + Math.floor(rnd() * 10)), pick(['Allowed_With_Citation', 'Actively_Encouraged', 'Strict_Ban']), String(1 + Math.floor(rnd() * 10)), Math.min(4, pre + 0.2 * rnd()).toFixed(3), (60 + 40 * rnd()).toFixed(2), pick(['Low', 'Medium', 'High'])]; });
const cat = A.catalog(H, rows), ask = q => A.parse(q, H, rows, cat), nm = i => H[i];
const t = (q, intent, y, f, extra) => test(`“${q}” → ${intent}`, () => { const r = ask(q); assert.equal(r.intent, intent, JSON.stringify(plain({ intent: r.intent, say: r.say }))); if (y !== undefined) assert.equal(nm(r.y), y); if (f !== undefined) assert.equal(r.f != null && r.f >= 0 ? nm(r.f) : (r.x != null ? nm(r.x) : null), f); if (extra) extra(r); });
t('What affects burnout?', 'why', 'Burnout_Risk_Level', undefined, r => assert.equal(r.yCat.value, 'High'));
t('Why is burnout high?', 'why', 'Burnout_Risk_Level', undefined, r => assert.equal(r.yCat.value, 'High'));
t('what affects Skill retention', 'why', 'Skill_Retention_Score');
t('What factors drive study hours', 'why', 'Traditional_Study_Hours');
t('क्या प्रभावित करता है बर्नआउट', 'why', 'Burnout_Risk_Level');
t('Does paid subscription change GPA?', 'fair', 'Post_Semester_GPA', 'Paid_Subscription');
t('Is Post GPA different for each major?', 'fair', 'Post_Semester_GPA', 'Major_Category');
t('what is the effect of study hours on post GPA', 'fair', 'Post_Semester_GPA', 'Traditional_Study_Hours');
t('compare skill retention between beginner and advanced', 'fair', 'Skill_Retention_Score', 'Prompt_Engineering_Skill');
t('Does a strict ban affect burnout?', 'why', 'Burnout_Risk_Level', 'Institutional_Policy');
t('Average post semester GPA by year of study', 'agg_by', 'Post_Semester_GPA', 'Year_of_Study', r => assert.equal(r.fn, 'avg'));
t('औसत post semester gpa year of study के अनुसार', 'agg_by', 'Post_Semester_GPA', 'Year_of_Study');
t('total tool diversity by use case', 'agg_by', 'Tool_Diversity', 'Primary_Use_Case', r => assert.equal(r.fn, 'sum'));
t('Which major has the highest GPA?', 'top', 'Post_Semester_GPA', 'Major_Category', r => assert.equal(r.sort, 'desc'));
t('which use case has the lowest skill retention', 'top', 'Skill_Retention_Score', 'Primary_Use_Case', r => assert.equal(r.sort, 'asc'));
t('average weekly AI hours', 'agg', 'Weekly_GenAI_Hours');
t('median study hours', 'agg', 'Traditional_Study_Hours', undefined, r => assert.equal(r.fn, 'median'));
t('How many have High burnout?', 'count', undefined, undefined, r => assert.deepEqual(plain(r.conds), [{ col: 15, value: 'High' }]));
t('How many students use AI for debugging?', 'count', undefined, undefined, r => assert.equal(r.conds[0].value, 'Debugging/Troubleshooting'));
t('how many strict ban students have high burnout', 'count', undefined, undefined, r => assert.equal(r.conds.length, 2));
t('how many students are in each year', 'count_by', undefined, 'Year_of_Study');
t('average GPA of STEM students', 'agg', 'Post_Semester_GPA', undefined, r => assert.deepEqual(plain(r.conds), [{ col: 1, value: 'STEM' }]));
t('Do students improve their GPA?', 'change');
t('What affects the change in GPA?', 'why_change');
t('Is AI dependency related to anxiety?', 'corr');
t('distribution of weekly genai hours', 'dist', undefined, 'Weekly_GenAI_Hours');
t('find duplicates', 'tool'); t('combine two files', 'tool');
t('blah blah', 'none'); t('what is the meaning of life', 'none');
test('GPA means the end of a before/after pair unless the question says pre; the other is offered', () => {
  assert.equal(nm(ask('average GPA').y), 'Post_Semester_GPA'); assert.ok(ask('average GPA').alts.some(a => a.name === 'Pre_Semester_GPA'));
  assert.equal(nm(ask('average pre semester GPA').y), 'Pre_Semester_GPA');
});
test('two columns that match the same word are offered as alternatives with a rewritten question', () => {
  const r = ask('average hours by year of study'); assert.ok(r.alts.length >= 1 && /Hours/.test(r.alts[0].q), JSON.stringify(plain(r.alts)));
  assert.equal(ask(r.alts[0].q).y, H.indexOf(r.alts[0].name));
});
test('example questions are about this file and all of them are understood', () => {
  const ex = A.examples(H, rows, cat); assert.ok(ex.length >= 4);
  ex.forEach(q => { const r = ask(q); assert.notEqual(r.intent, 'none', q); assert.ok(r.conf >= 0.6, q + ' ' + r.conf); });
});
// a different file: tracks with audio scores and a yes/no target
const SH = ['track_id', 'genre', 'release_year', 'duration_sec', 'danceability', 'energy', 'tempo_bpm', 'loudness_db', 'streams', 'viral'];
const SR = Array.from({ length: 1200 }, (_, i) => [`track_${i}`, pick(['Pop', 'Rock', 'Jazz', 'Latin']), String(2010 + (i % 16)), String(120 + (i % 150)), rnd().toFixed(3), rnd().toFixed(3), (80 + 80 * rnd()).toFixed(1), (-14 + 12 * rnd()).toFixed(2), String(Math.round(Math.exp(10 + 4 * rnd()))), String(rnd() < 0.36 ? 1 : 0)]);
const scat = A.catalog(SH, SR), sask = q => A.parse(q, SH, SR, scat), sn = i => SH[i];
test('another file: tracks and streams', () => {
  let r = sask('what makes a song go viral'); assert.equal(r.intent, 'why'); assert.equal(sn(r.y), 'viral');
  r = sask('why do some tracks get more streams'); assert.equal(r.intent, 'why'); assert.equal(sn(r.y), 'streams');
  r = sask('do louder songs get more streams'); assert.equal(r.intent, 'fair'); assert.equal(sn(r.y), 'streams'); assert.equal(sn(r.f), 'loudness_db');
  r = sask('average danceability by genre'); assert.equal(r.intent, 'agg_by'); assert.equal(sn(r.y), 'danceability'); assert.equal(sn(r.x), 'genre');
  r = sask('which genre has the highest streams'); assert.equal(r.intent, 'top'); assert.equal(sn(r.x), 'genre');
  r = sask('how many tracks per genre'); assert.equal(r.intent, 'count_by'); assert.equal(sn(r.x), 'genre');
  r = sask('is energy related to loudness'); assert.equal(r.intent, 'corr'); r = sask('distribution of tempo'); assert.equal(r.intent, 'dist'); assert.equal(sn(r.x), 'tempo_bpm');
});
test('text outcome by group: “which policy has the highest burnout”', () => { const r = ask('which policy has the highest burnout'); assert.equal(r.intent, 'top'); assert.equal(nm(r.y), 'Burnout_Risk_Level'); assert.equal(r.yCat.value, 'High'); assert.equal(nm(r.x), 'Institutional_Policy'); });
test('a 1-10 scale is a number, not a category: “what is behind high dependency”', () => { const r = ask('what is behind high dependency'); assert.equal(r.intent, 'why'); assert.equal(nm(r.y), 'Perceived_AI_Dependency'); assert.ok(!r.yCat); });
