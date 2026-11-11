// TODO: hybrid search (vector + keyword) with date filters.

export type RetrieveParams = {
  userId: string;
  query: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

export async function retrieveMemories(params: RetrieveParams): Promise<string[]> {
  void params;
  throw new Error("Not implemented");
}
