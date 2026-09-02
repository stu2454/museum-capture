#!/bin/sh
# Upload first, then apply seeds/seed-ehive-photos.sql.
set -e

npx wrangler r2 object put "artefact-photos/photos/ehive_1831718/img_ehive_1831718.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1020.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831711/img_ehive_1831711.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1055a.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1838513/img_ehive_1838513.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1089.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831726/img_ehive_1831726.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M12.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831714/img_ehive_1831714.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1227.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_838375/img_ehive_838375.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1313.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831716/img_ehive_1831716.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1353.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1657926/img_ehive_1657926.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1502a.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755256/img_ehive_1755256.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1514.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755439/img_ehive_1755439.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1579.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831712/img_ehive_1831712.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1584.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1654528/img_ehive_1654528.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1595.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831715/img_ehive_1831715.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1651.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755398/img_ehive_1755398.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1652.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831713/img_ehive_1831713.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1665.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831717/img_ehive_1831717.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1668.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1664052/img_ehive_1664052.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1686.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831783/img_ehive_1831783.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1716.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831721/img_ehive_1831721.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1717.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831720/img_ehive_1831720.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1721.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831722/img_ehive_1831722.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1722.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831723/img_ehive_1831723.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1723.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831725/img_ehive_1831725.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M1724.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1841769/img_ehive_1841769.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M239.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755390/img_ehive_1755390.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M278.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755421/img_ehive_1755421.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M43.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755346/img_ehive_1755346.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M436.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755443/img_ehive_1755443.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M44.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1754068/img_ehive_1754068.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M521.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1754074/img_ehive_1754074.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M654a.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1755437/img_ehive_1755437.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M654b.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_1831724/img_ehive_1831724.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/M677.jpg" --content-type=image/jpeg
npx wrangler r2 object put "artefact-photos/photos/ehive_838377/img_ehive_838377.jpg" --file="/Users/stusmith/dev/Artefact_Capture/museum-capture/.ehive-jpeg/No_M_number_tablecloth.jpg" --content-type=image/jpeg
