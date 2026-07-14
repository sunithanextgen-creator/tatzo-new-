export type DummyArtist = {
  id: string;
  name: string;
  studioName?: string;
  handle: string;
  specialty: string;
  location: string;
  status: string;
  category?: string;
  rating?: number;
  startingFrom?: number;
  verified?: boolean;
  tags: readonly string[];
  profileImageUrl?: string;
  bookingEnabled?: boolean;
  bookingDisabledMessage?: string;
  availableDays?: string[];
  startTime?: string;
  endTime?: string;
  vacationReturnDate?: string | null;
  profileVisibility?: 'public' | 'private';
  availabilityStatus?: 'available' | 'unavailable';
};

export const dummyArtists: DummyArtist[] = [
  {
    id: 'artist-1',
    name: 'Synthink',
    handle: '@synthink',
    specialty: 'Geometric | Fine line',
    location: 'Chennai',
    status: 'Open for consultation',
    category: 'Geometric',
    rating: 4.9,
    startingFrom: 5000,
    verified: true,
    tags: ['mandala', 'geometry', 'uv', 'fine line'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Synthink&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-2',
    name: 'InkNova',
    handle: '@inknova',
    specialty: 'Neo traditional | Bold color',
    location: 'Chennai',
    status: 'Booking next week',
    category: 'Neo traditional',
    rating: 4.8,
    startingFrom: 3500,
    verified: true,
    tags: ['neo traditional', 'bold', 'color', 'sleeve'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=InkNova&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-3',
    name: 'Black Orchid',
    handle: '@blackorchid',
    specialty: 'Blackwork | Premium',
    location: 'Chennai',
    status: 'Aftercare included',
    category: 'Blackwork',
    rating: 4.7,
    startingFrom: 2500,
    verified: true,
    tags: ['blackwork', 'contrast', 'premium', 'shadow'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Black%20Orchid&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-4',
    name: "Sanya 'Void' Rao",
    handle: '@voidrao',
    specialty: 'Cyber tribal | Dark',
    location: 'Chennai',
    status: 'Appointments only',
    category: 'Cyber tribal',
    rating: 5.0,
    startingFrom: 8000,
    verified: true,
    tags: ['cyber', 'tribal', 'dark', 'pattern'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Sanya%20Void%20Rao&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-5',
    name: 'Vikram Ink',
    handle: '@vikramink',
    specialty: 'Neo traditional | Color',
    location: 'Chennai',
    status: 'Starting this week',
    category: 'Neo traditional',
    rating: 4.9,
    startingFrom: 5000,
    verified: true,
    tags: ['neo traditional', 'color', 'flash'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Vikram%20Ink&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-6',
    name: 'Elena Thorne',
    handle: '@elenathorne',
    specialty: 'Fine line | Minimal',
    location: 'Chennai',
    status: 'Taking bookings',
    category: 'Fine line',
    rating: 4.8,
    startingFrom: 3500,
    verified: true,
    tags: ['fine line', 'minimal', 'linework'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Elena%20Thorne&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-7',
    name: 'Rajesh K.',
    handle: '@rajeshk',
    specialty: 'Blackwork | Sleeve',
    location: 'Chennai',
    status: 'Verified studio',
    category: 'Blackwork',
    rating: 4.7,
    startingFrom: 2500,
    verified: true,
    tags: ['blackwork', 'sleeve', 'contrast'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Rajesh%20K&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-8',
    name: 'Geometric Ink',
    handle: '@geometricink',
    specialty: 'Geometry | Patterns',
    location: 'Chennai',
    status: 'New styles',
    category: 'Geometric',
    rating: 4.6,
    startingFrom: 4000,
    verified: false,
    tags: ['geometry', 'pattern', 'line'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Geometric%20Ink&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-9',
    name: 'Aftercare Lab',
    handle: '@aftercarelab',
    specialty: 'Aftercare | Studio',
    location: 'Chennai',
    status: 'Partner studio',
    category: 'Aftercare',
    rating: 4.5,
    startingFrom: 0,
    verified: false,
    tags: ['aftercare', 'healing', 'studio'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Aftercare%20Lab&backgroundType=gradientLinear&fontFamily=Arial',
  },
  {
    id: 'artist-10',
    name: 'Metallic Touch',
    handle: '@metallictouch',
    specialty: 'Premium | Metallic',
    location: 'Chennai',
    status: 'Appointments only',
    category: 'Premium',
    rating: 4.8,
    startingFrom: 7000,
    verified: true,
    tags: ['premium', 'silver', 'finish'],
    profileImageUrl: 'https://api.dicebear.com/8.x/initials/png?seed=Metallic%20Touch&backgroundType=gradientLinear&fontFamily=Arial',
  },
];
