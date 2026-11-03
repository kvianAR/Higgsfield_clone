export type ReferenceElement = { id: string; name: string; description: string; assetIds: string[] };
export type StoryShot = { id: string; title: string; prompt: string; duration: number; elementIds: string[]; order: number };

/** Identity notes accompany every shot; reference media still needs a compatible model. */
export function continuityBrief(prompt: string, elements: ReferenceElement[]): string {
    const notes = elements.map(element => `${element.name}: ${element.description.trim()}`).filter(note => !note.endsWith(': '));
    return [prompt.trim(), ...(notes.length ? ['Continuity references:', ...notes, 'Keep the identity, costume and defining details of these references consistent.'] : [])].join('\n');
}

export function storyBrief(shots: StoryShot[], elements: ReferenceElement[]): string {
    return [...shots].sort((a, b) => a.order - b.order).map((shot, index) =>
        `Shot ${index + 1}: ${shot.title} (${shot.duration}s)\n${continuityBrief(shot.prompt, elements.filter(element => shot.elementIds.includes(element.id)))}`
    ).join('\n\n');
}

export function moveShot<T extends { id: string; order: number }>(shots: T[], id: string, offset: -1 | 1): T[] {
    const ordered = [...shots].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex(shot => shot.id === id), target = index + offset;
    if (index < 0 || target < 0 || target >= ordered.length) return ordered;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    return ordered.map((shot, order) => ({ ...shot, order }));
}
