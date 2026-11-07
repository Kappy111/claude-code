// Public: returns the playlist (the songs the owner has added).
const { readList } = require('./_lib');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const arr = await readList();
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(arr));
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
