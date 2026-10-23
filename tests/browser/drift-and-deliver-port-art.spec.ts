import { registerArtShots } from "./drift-and-deliver-art-lib";

// software GL renders about one frame per 5 minutes here, so the shot list is split over two specs that run as separate remote runs
registerArtShots("drift-and-deliver-port", ["z-idle", "z-drive", "z-drift", "z-boost", "x-idle", "x-drive"]);
