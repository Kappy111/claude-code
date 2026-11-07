// Lists the uploaded songs from Blob storage. Public (read-only).
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { list } = await import('@vercel/blob');
    const out = await list({ prefix: 'songs/' });
    const songs = (out.blobs || []).map(function (b) {
      let title = b.pathname.replace(/^songs\//, '').replace(/\.(mp3|m4a|wav|ogg)$/i, '');
      try { title = decodeURIComponent(title); } catch (e) {}
      return {
        title: title,
        url: b.url,
        downloadUrl: b.downloadUrl || b.url,
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt
      };
    }).sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(songs));
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
