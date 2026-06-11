import { Vector3 } from "three";

// World-space point the camera is looking at this frame. CameraRig writes it,
// the DepthOfField effect reads it so focus racks with the subject of each act.
export const focusTarget = new Vector3(0, 0, 0);
