const movies = [
  {
    id: 1,
    title: "Oppenheimer",
    director: "Christopher Nolan",
    year: 2023,
    duration: "2h 29min",
    rating: 8.3,
    description:
      "During World War II, Lt. Gen. Leslie Groves Jr. appoints physicist J. Robert Oppenheimer to work on the top-secret Manhattan Project. Oppenheimer and a team of scientists spend years developing and designing the atomic bomb. Their work comes to fruition on July 16, 1945, as they witness the world’s first nuclear explosion, forever changing the course of history.",
    poster: "https://placehold.co/320x480?text=Oppenheimer+Poster",
    backdrop: "https://placehold.co/1600x900?text=Oppenheimer+Backdrop",
    cast: [
      {
        name: "Cillian Murphy",
        role: "J. Robert Oppenheimer",
        image: "https://placehold.co/220x260?text=Cillian+Murphy",
      },
      {
        name: "Emily Blunt",
        role: "Kitty Oppenheimer",
        image: "https://placehold.co/220x260?text=Emily+Blunt",
      },
      {
        name: "Matt Damon",
        role: "Leslie Groves",
        image: "https://placehold.co/220x260?text=Matt+Damon",
      },
      {
        name: "Robert Downey Jr.",
        role: "Lewis Strauss",
        image: "https://placehold.co/220x260?text=RDJ",
      },
      {
        name: "Florence Pugh",
        role: "Jean Tatlock",
        image: "https://placehold.co/220x260?text=Florence+Pugh",
      },
      {
        name: "Josh Hartnett",
        role: "Ernest Lawrence",
        image: "https://placehold.co/220x260?text=Josh+Hartnett",
      },
    ],
    reviews: [
      {
        username: "Marek123",
        date: "23.6.2024",
        rating: 8,
        text: "Silný film, výborný výkon Cilliana Murphyho a veľmi dobre vystavané napätie počas celého filmu.",
        helpfulCount: 12,
        commentCount: 1,
      },
      {
        username: "Ferlond",
        date: "29.7.2026",
        rating: 7,
        text: "Technicky veľmi kvalitné, vizuálne super, ale miestami som sa v množstve postáv a dialógov strácal.",
        helpfulCount: 9,
        commentCount: 0,
      },
      {
        username: "xdanx",
        date: "30.2.2025",
        rating: 9,
        text: "Jeden z najsilnejších kino zážitkov za posledné roky. Hudba, obraz aj tempo fungovali perfektne.",
        helpfulCount: 15,
        commentCount: 3,
      },
    ],
  },
];

module.exports = movies;
