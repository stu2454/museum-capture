-- Letting a person set their own name and colour.
--
-- Everything about a user has been admin-managed until now, which produced one
-- small indignity and one real problem. The indignity: on a shared museum device
-- everyone's badge is the same grey circle, so "is that me?" can't be answered
-- across a room. The problem: if an admin typed "Margeret" when adding someone,
-- the person it belongs to cannot correct it, and that name goes on every record
-- they make.
--
-- So this adds a colour, and the API that goes with it lets a person change their
-- own display_name and avatar_colour — and nothing else. Not their role, not
-- their status, not anyone else's row. Self-service stops exactly where it would
-- start being a way to grant yourself something.
--
-- The colour is stored as a NAME ("sage"), not a hex value. The palette lives in
-- the app's stylesheet, so it can be restyled without rewriting a single row, and
-- a name is checkable against a list in a way that arbitrary colour never is.

ALTER TABLE users ADD COLUMN avatar_colour TEXT;
