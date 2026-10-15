(function(root) {
  function mean(values) {
    return values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
  }
  function calculate(report) {
    const relative=[],angles=[],distances=[];
    let completed=0,proRounds=0;
    for(const round of report.rounds) {
      if(round.mode==='hard')proRounds++;
      // Statistics are personal, including when a private report contains everyone.
      const submission=round.entries.find(entry=>entry.uid===report.uid)?.submission;
      if(!submission)continue;
      completed++;
      const measured=root.BussoleReportGeometry.measure(submission,round.target,round.mode);
      if(Number.isFinite(measured.angleError))angles.push(measured.angleError);
      // A target at the start has no meaningful relative distance error.
      if(measured.initialDistance>1e-6) {
        const error=100*measured.errorMeters/measured.initialDistance;
        if(Number.isFinite(error))relative.push(error);
        if(round.mode==='hard') {
          const distance=100*(submission.distanceMeters-measured.initialDistance)/measured.initialDistance;
          if(Number.isFinite(distance))distances.push(distance);
        }
      }
    }
    return {
      rounds:report.rounds.length,completed,missed:report.rounds.length-completed,proRounds,
      relativeCount:relative.length,angleCount:angles.length,distanceCount:distances.length,
      relativeError:mean(relative),absoluteAngle:mean(angles.map(Math.abs)),angleBias:mean(angles),
      absoluteDistance:mean(distances.map(Math.abs)),distanceBias:mean(distances)
    };
  }
  root.BussoleSummaryStatistics={calculate};
})(window);
