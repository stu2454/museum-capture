#!/bin/sh
# Upload first, then apply seeds/seed-ehive-photos.sql.
set -e

npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_e_574a2bd0e164ac94.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/ehive_1831724-61c75b63cbf54fd99be64f69d2a82f6a_o.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_e_f7e2e58e732ab721.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/ehive_1831724-92da3d82e3794cd9aa71cb9efff83f3a_o.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_e_1c01f1a57a13deb4.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/ehive_1831724-b800347a08b84444b40908bc51f4fdbd_o.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_e_102958375233df36.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/ehive_1831724-d0ba1e85d7474bc29398af5b11caafa8_o.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_e_8ac6f0f689518912.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/ehive_1831724-e0ef9a79c3a44336b28810ffa8c8c78e_o.jpg" --content-type=image/jpeg
