export type BaseDocument = {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type CardCatalogVersionDocument = BaseDocument & {
  versionHash: string;
  setFiles: string[];
  cardCount: number;
};
