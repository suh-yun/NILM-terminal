(function attachPowerDashboardData() {
  // 1. 아산공학관 강의실 생성 (101~410)
  const asanClassrooms = [];
  for (let f = 1; f <= 4; f++) {
    for (let r = 1; r <= 10; r++) {
      const roomId = `${f}${r < 10 ? '0' + r : r}`;
      asanClassrooms.push({
        id: `A${roomId}`,
        name: `${roomId}호 강의실`,
        floor: `${f}`,
        devices: []
      });
    }
  }

  // 2. 신공학관 강의실 생성 (B201~510)
  const newClassrooms = [];
  const newFloors = ["B2", "B1", "1", "2", "3", "4", "5"];
  newFloors.forEach(f => {
    for (let r = 1; r <= 10; r++) {
      const roomId = `${f}${r < 10 ? '0' + r : r}`;
      newClassrooms.push({
        id: `N${roomId}`,
        name: `${roomId}호 강의실`,
        floor: f,
        devices: []
      });
    }
  });

  // 3. 기기 5개를 각각 다른 강의실에 딱 하나씩만 배치
  // [아산공학관 구역]
  asanClassrooms.find(c => c.id === "A401").devices = [
    { id: "dev-pot", name: "커피포트", currentW: 0, isOn: false }
  ];
  asanClassrooms.find(c => c.id === "A305").devices = [
    { id: "dev-indu", name: "인두기", currentW: 0, isOn: false }
  ];
  asanClassrooms.find(c => c.id === "A202").devices = [
    { id: "dev-air-2", name: "공기청정기(2레벨)", currentW: 0, isOn: false }
  ];

  // [신공학관 구역]
  newClassrooms.find(c => c.id === "N101").devices = [
    { id: "dev-air-1", name: "공기청정기(1레벨)", currentW: 0, isOn: false }
  ];
  newClassrooms.find(c => c.id === "N505").devices = [
    { id: "dev-charger", name: "충전기", currentW: 0, isOn: false }
  ];

  window.POWER_DASHBOARD_DATA = {
    buildings: [
      {
        id: "ASAN",
        name: "아산공학관",
        floors: ["4", "3", "2", "1"],
        classrooms: asanClassrooms
      },
      {
        id: "NEW",
        name: "신공학관",
        floors: ["5", "4", "3", "2", "1", "B1", "B2"],
        classrooms: newClassrooms
      }
    ]
  };

  if (!window.POWER_DASHBOARD_DATA.building) {
    window.POWER_DASHBOARD_DATA.building = window.POWER_DASHBOARD_DATA.buildings?.[0];
  }
})();