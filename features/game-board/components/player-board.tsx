import { FC } from "react";
import { CardTile } from "./card-tile";
import { ZoneArea } from "./zone-area";
import { ArchiveX, Logs } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  isMirrored?: boolean;
};

const BaseLine = () => (
  <div className="gap-2 grid grid-cols-[130px_130px_minmax(0,1fr)_130px]">
    {/* choosen champion */}
    <ZoneArea isCentered>
      <CardTile
        img="https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/17d0793ad495727e67bb1c94ae0e11cd4705870f-744x1039.png"
        name="back card"
      />
    </ZoneArea>
    {/* Legend */}
    <ZoneArea isCentered>
      <CardTile
        img="https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/44885d811b70621b188d9813b2b10b5cff1b81e6-744x1039.png"
        name="back card"
      />
    </ZoneArea>
    <div className="bg-white/5 rounded-md">B</div>
    <ZoneArea isCentered>
      <CardTile img="./cardback.jpg" name="back card" />
    </ZoneArea>
  </div>
);

const RunesLine = () => (
  <div className="gap-2 grid grid-cols-[130px_minmax(0,1fr)_130px_64px]">
    {/* Runes deck */}
    <ZoneArea isCentered>
      <CardTile img="./cardback.jpg" name="back card" />
    </ZoneArea>
    {/* runes in play */}
    <ZoneArea>
      {Array.from({ length: 12 }).map((_, index) => (
        <CardTile
          key={index}
          img="https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/f99aa4874baaebd2e81798c8a3aa01c5900f6d30-744x1039.png"
          name="Mind Rune"
          isExhausted={index === 3}
        />
      ))}
    </ZoneArea>
    {/* Trash */}
    <ZoneArea isCentered>
      <CardTile img="./cardback.jpg" name="back card" />
    </ZoneArea>
    {/* Banished Cards */}
    <ZoneArea isCentered>
      {/* wire this player banish cards to this */}
      <Button variant={"ghost"} className="p-2">
        <ArchiveX className="size-5" />
      </Button>
    </ZoneArea>
  </div>
);

export const PlayerBoard: FC<Props> = ({ isMirrored }) => {
  if (isMirrored) {
    return (
      <>
        <RunesLine />
        <BaseLine />
      </>
    );
  }
  return (
    <>
      <BaseLine />
      <RunesLine />
    </>
  );
};
