export type CreativeAsset = { id: string; name: string; url: string; mimeType: string; size: number; createdAt: string };
export type CreativeProject = { id: string; name: string; brief: string; canvas?: unknown; createdAt: string; updatedAt: string };
export type CreativeElement = { id: string; name: string; kind: 'character' | 'location' | 'prop' | 'product'; description: string; assetIds: string[]; createdAt: string };
export type CreativeShot = { id: string; projectId: string; title: string; prompt: string; duration: number; elementIds: string[]; assetIds: string[]; order: number; status?: string; sourceTaskId?: string; jobId?: string };
export type CreativePost = { id: string; title: string; prompt: string; assetIds: string[]; author: string; likes: number; sourceId?: string; createdAt: string };
export type CreativeWorkspace = { revision: number; projects: CreativeProject[]; elements: CreativeElement[]; shots: CreativeShot[]; posts: CreativePost[]; assets: CreativeAsset[] };
export type WorkspaceKind = 'projects' | 'elements' | 'shots' | 'posts';
