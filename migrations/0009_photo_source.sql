-- Where a photograph came from.
--
-- Every image until now was taken by a volunteer through the capture app. The
-- eHive import brings in photographs that were not: they came out of the museum's
-- existing eHive records, at whatever size and quality eHive held them.
--
-- Worth recording for the same reason synced_by is. A catalogue that cannot say
-- where its evidence came from invites the assumption that it all came from the
-- same place, and in five years nobody will remember that some of these were
-- lifted from a report rather than shot against a plain background.
--
-- NULL means captured here, which is what every existing row is.

ALTER TABLE photos ADD COLUMN source TEXT;
