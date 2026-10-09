import { db } from '../db.js';
import { nanoid } from 'nanoid';

const insert = db.prepare(`
  INSERT INTO notifications (id, recipient_id, sender_id, notification_type, post_id, comment_id)
  VALUES (@id, @recipient_id, @sender_id, @notification_type, @post_id, @comment_id)
`);

const existsUnread = db.prepare(`
  SELECT id FROM notifications
  WHERE recipient_id = @recipient_id AND sender_id = @sender_id
    AND notification_type = @notification_type
    AND COALESCE(post_id,'') = COALESCE(@post_id,'')
    AND COALESCE(comment_id,'') = COALESCE(@comment_id,'')
    AND read_status = 0
`);

export async function notify({ recipientId, senderId, type, postId = null, commentId = null }) {
  if (!recipientId || recipientId === senderId) return;
  const params = {
    recipient_id: recipientId,
    sender_id: senderId,
    notification_type: type,
    post_id: postId,
    comment_id: commentId,
  };
  if (await existsUnread.get(params)) return;
  await insert.run({ id: nanoid(), ...params });
}

export const removeNotification = db.prepare(`
  DELETE FROM notifications
  WHERE recipient_id = @recipient_id AND sender_id = @sender_id
    AND notification_type = @notification_type
    AND COALESCE(post_id,'') = COALESCE(@post_id,'')
`);
