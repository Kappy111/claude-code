import { db } from '../db.js';
import { nanoid } from 'nanoid';

const insert = db.prepare(`
  INSERT INTO notifications (id, recipient_id, sender_id, notification_type, post_id, comment_id)
  VALUES (@id, @recipient_id, @sender_id, @notification_type, @post_id, @comment_id)
`);

// De-dupe: don't create an identical unread notification twice (e.g. like/unlike/like).
const existsUnread = db.prepare(`
  SELECT id FROM notifications
  WHERE recipient_id = @recipient_id AND sender_id = @sender_id
    AND notification_type = @notification_type
    AND IFNULL(post_id,'') = IFNULL(@post_id,'')
    AND IFNULL(comment_id,'') = IFNULL(@comment_id,'')
    AND read_status = 0
`);

export function notify({ recipientId, senderId, type, postId = null, commentId = null }) {
  if (!recipientId || recipientId === senderId) return; // never notify yourself
  const params = {
    recipient_id: recipientId,
    sender_id: senderId,
    notification_type: type,
    post_id: postId,
    comment_id: commentId,
  };
  if (existsUnread.get(params)) return;
  insert.run({ id: nanoid(), ...params });
}

export const removeNotification = db.prepare(`
  DELETE FROM notifications
  WHERE recipient_id = @recipient_id AND sender_id = @sender_id
    AND notification_type = @notification_type
    AND IFNULL(post_id,'') = IFNULL(@post_id,'')
`);
