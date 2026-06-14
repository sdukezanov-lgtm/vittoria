-- Normalize all user phones to canonical E.164 +7XXXXXXXXXX, merging duplicates that
-- collapse to the same number and leaving foreign/malformed numbers untouched.
-- Idempotent: a second run is a no-op (already-canonical rows are unchanged, no collisions remain).

-- Session-local normalization function mirroring apps/api/src/common/phone.ts.
CREATE FUNCTION pg_temp.norm_ru(raw text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN raw IS NULL THEN NULL
    WHEN left(btrim(raw), 1) = '+' THEN
      CASE WHEN regexp_replace(raw, '\D', '', 'g') ~ '^7[0-9]{10}$'
           THEN '+' || regexp_replace(raw, '\D', '', 'g')
           ELSE NULL END
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^8[0-9]{10}$'
      THEN '+7' || substring(regexp_replace(raw, '\D', '', 'g') from 2)
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^7[0-9]{10}$'
      THEN '+' || regexp_replace(raw, '\D', '', 'g')
    WHEN regexp_replace(raw, '\D', '', 'g') ~ '^[0-9]{10}$'
      THEN '+7' || regexp_replace(raw, '\D', '', 'g')
    ELSE NULL
  END
$$;

-- Phase 0: drop ephemeral OTP codes (they reference users.phone and are short-lived anyway).
DELETE FROM auth_codes;

-- Phase 1: merge users that normalize to the same phone.
-- Survivor per group = the row already in canonical form if present, else the earliest created.
CREATE TEMP TABLE phone_merge_map AS
WITH norm AS (
  SELECT id, phone, created_at, pg_temp.norm_ru(phone) AS np
  FROM users
  WHERE pg_temp.norm_ru(phone) IS NOT NULL
),
grp AS (
  SELECT np,
         (ARRAY_AGG(id ORDER BY (phone = np) DESC, created_at ASC))[1] AS survivor_id,
         ARRAY_AGG(id) AS ids
  FROM norm
  GROUP BY np
  HAVING COUNT(*) > 1
)
SELECT g.survivor_id, u AS loser_id
FROM grp g, UNNEST(g.ids) AS u
WHERE u <> g.survivor_id;

-- Reassign every reference from losers to survivors before deleting the loser rows.
UPDATE orders o SET client_user_id = m.survivor_id
  FROM phone_merge_map m WHERE o.client_user_id = m.loser_id;
UPDATE orders o SET partner_user_id = m.survivor_id
  FROM phone_merge_map m WHERE o.partner_user_id = m.loser_id;
UPDATE messages x SET sender_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.sender_user_id = m.loser_id;
UPDATE attachments x SET uploader_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.uploader_user_id = m.loser_id;
UPDATE partner_commissions x SET partner_user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.partner_user_id = m.loser_id;
UPDATE sessions x SET user_id = m.survivor_id
  FROM phone_merge_map m WHERE x.user_id = m.loser_id;
-- push_tokens has UNIQUE(user_id, device_id); losers' device tokens are regenerated on next
-- app login, so drop them rather than risk a unique conflict on reassignment.
DELETE FROM push_tokens x USING phone_merge_map m WHERE x.user_id = m.loser_id;

DELETE FROM users x USING phone_merge_map m WHERE x.id = m.loser_id;

DROP TABLE phone_merge_map;

-- Phase 2: normalize the remaining users (skip unnormalizable; no-op for already-canonical).
UPDATE users
SET phone = pg_temp.norm_ru(phone)
WHERE pg_temp.norm_ru(phone) IS NOT NULL
  AND phone <> pg_temp.norm_ru(phone);
