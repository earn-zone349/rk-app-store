-- 0016_support_and_payment_gaps.sql built the support ticket tables but
-- didn't wire them into the existing notifications system (0013_
-- notifications.sql, the 🔔 bell) — a user replying to their own ticket
-- got no admin-facing signal beyond "go check /admin/support periodically
-- and hope," and an admin's reply gave the user no signal either. This
-- closes that gap with a trigger, same reasoning as
-- notify_on_support_message would have used: automatic beats "every
-- future code path that inserts a reply has to remember to also notify."

create or replace function notify_on_support_reply()
returns trigger as $$
declare
  v_ticket_owner uuid;
  v_admin record;
begin
  update support_tickets set updated_at = now() where id = new.ticket_id;

  if new.sender_type = 'admin' then
    select user_id into v_ticket_owner from support_tickets where id = new.ticket_id;
    insert into notifications (user_id, title, body)
    values (v_ticket_owner, 'Support ticket-এ নতুন উত্তর', left(new.message, 200));
  else
    for v_admin in select user_id from admins loop
      insert into notifications (user_id, title, body)
      values (
        v_admin.user_id,
        'নতুন Support Message',
        left((select subject from support_tickets where id = new.ticket_id) || ': ' || new.message, 200)
      );
    end loop;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- support_ticket_replies_touch (0016_support_and_payment_gaps.sql) already
-- keeps updated_at fresh — this trigger does that too (harmless, same
-- statement) plus the actual notification insert, so both triggers firing
-- on the same insert is fine, not a conflict.
create trigger support_reply_notify
  after insert on support_ticket_replies
  for each row execute function notify_on_support_reply();
