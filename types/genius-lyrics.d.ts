declare module 'genius-lyrics' {
    export class Client {
        constructor(key?: string);
        songs: {
            search(query: string): Promise<Song[]>;
            get(id: number): Promise<Song>;
        };
    }

    export class Song {
        id: number;
        title: string;
        artist: { name: string };
        thumbnail: string;
        url: string;
        lyrics(): Promise<string>;
    }
}
