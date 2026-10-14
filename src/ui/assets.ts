import arrowDown from '../assets/arrow-down.svg';
import arrowLeft from '../assets/arrow-left.svg';
import arrowRight from '../assets/arrow-right.svg';
import arrowUp from '../assets/arrow-up.svg';
import dpadDown from '../assets/dpad-down.svg';
import dpadLeft from '../assets/dpad-left.svg';
import dpadRight from '../assets/dpad-right.svg';
import dpadUp from '../assets/dpad-up.svg';
import helpIcon from '../assets/help-icon.svg';
import helpLabel from '../assets/help-label.svg';
import iconBack from '../assets/icon-back.svg';
import iconClose from '../assets/icon-close.svg';
import iconFit from '../assets/icon-fit.svg';
import iconPlay from '../assets/icon-play.svg';
import iconRecenter from '../assets/icon-recenter.svg';
import iconShare from '../assets/icon-share.svg';
import iconZoomIn from '../assets/icon-zoom-in.svg';
import iconZoomOut from '../assets/icon-zoom-out.svg';
import knob from '../assets/knob.svg';
import playerDown from '../assets/player-down.svg';
import playerLeft from '../assets/player-left.svg';
import playerRight from '../assets/player-right.svg';
import playerUp from '../assets/player-up.svg';
import treasure from '../assets/treasure.svg';

export const icons = {
  helpIcon, helpLabel, iconBack, iconClose, iconFit, iconPlay, iconRecenter, iconShare,
  iconZoomIn, iconZoomOut, knob, treasure,
};

/** Dir (1..4) ごとの画像 */
export const arrowSrc = ['', arrowUp, arrowRight, arrowDown, arrowLeft];
export const playerSrc = ['', playerUp, playerRight, playerDown, playerLeft];
export const dpadSrc = { up: dpadUp, right: dpadRight, down: dpadDown, left: dpadLeft };

/** canvas 描画用に読み込んだ画像 */
export const canvasImages = {
  arrows: [] as HTMLImageElement[],
  treasure: null as HTMLImageElement | null,
};

/** 画像を読み込む。失敗しても止めない（その画像が描かれないだけ） */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve) => {
    const im = new Image();
    im.addEventListener('load', () => resolve(im));
    im.addEventListener('error', () => resolve(im));
    im.src = src;
  });
}

export function loadCanvasImages(): Promise<void> {
  return Promise.all([...arrowSrc.slice(1).map(loadImage), loadImage(treasure)]).then((ims) => {
    canvasImages.arrows = [new Image(), ...ims.slice(0, 4)];
    canvasImages.treasure = ims[4];
  });
}
