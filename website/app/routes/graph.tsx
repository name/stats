import { useLoaderData } from "@remix-run/react";
import { json, LoaderFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from "chart.js";
import 'chartjs-adapter-date-fns';

ChartJS.register(
  TimeScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const prisma = new PrismaClient();

export const loader: LoaderFunction = async () => {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const events = await prisma.inputEvent.findMany({
    where: {
      timestamp: {
        gte: twentyFourHoursAgo,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });
  

  // Create 30-minute intervals
  const intervals = Array.from({ length: 49 }, (_, i) => {
    const date = new Date(twentyFourHoursAgo);
    date.setMinutes(Math.floor(date.getMinutes() / 30) * 30);
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setMinutes(date.getMinutes() + i * 30);
    return date.toISOString();
  });

  const data = intervals.reduce((acc, interval) => {
    acc[interval] = {
      KeyPress: 0,
      Right: 0,
      Left: 0,
      Middle: 0,
    };
    return acc;
  }, {} as Record<string, Record<string, number>>);

  events.forEach((event) => {
    const eventTime = new Date(event.timestamp);
    const intervalIndex = Math.floor((eventTime.getTime() - twentyFourHoursAgo.getTime()) / (30 * 60 * 1000));
    if (intervalIndex >= 0 && intervalIndex < intervals.length - 1) {
      const intervalKey = intervals[intervalIndex];
      data[intervalKey][event.eventType]++;
    }
  });

  return json({ data, intervals, now: now.toISOString() });
};

export default function Graph() {
  const { data, intervals, now } = useLoaderData<typeof loader>();
  const currentTime = new Date(now);

  const totals = intervals.reduce((acc, interval) => {
    if (new Date(interval) <= currentTime) {
      acc.KeyPress += data[interval].KeyPress;
      acc.Right += data[interval].Right;
      acc.Left += data[interval].Left;
      acc.Middle += data[interval].Middle;
    }
    return acc;
  }, { KeyPress: 0, Right: 0, Left: 0, Middle: 0 });

  const chartData: ChartData<'line'> = {
    labels: intervals,
    datasets: [
      {
        label: 'Keypresses',
        data: intervals.map(interval => ({x: interval, y: new Date(interval) <= currentTime ? data[interval].KeyPress : null})),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0, // Set to 0 for straight lines
      },
      {
        label: 'Right Clicks',
        data: intervals.map(interval => ({x: interval, y: new Date(interval) <= currentTime ? data[interval].Right : null})),
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0, // Set to 0 for straight lines
      },
      {
        label: 'Left Clicks',
        data: intervals.map(interval => ({x: interval, y: new Date(interval) <= currentTime ? data[interval].Left : null})),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0, // Set to 0 for straight lines
      },
      {
        label: 'Middle Clicks',
        data: intervals.map(interval => ({x: interval, y: new Date(interval) <= currentTime ? data[interval].Middle : null})),
        borderColor: 'rgb(255, 206, 86)',
        backgroundColor: 'rgba(255, 206, 86, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0, // Set to 0 for straight lines
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          pointStyle: 'circle',
          padding: 20,
        },
      },
      title: {
        display: true,
        text: 'Input Events Over Last 24 Hours',
        font: {
          size: 16,
        },
        padding: {
          top: 10,
          bottom: 30,
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'HH:mm'
          }
        },
        ticks: {
          stepSize: 3,
          autoSkip: false,
          maxRotation: 0,
          major: {
            enabled: true
          },
          font: {
            size: 12
          },
        },
        title: {
          display: true,
          text: 'Time',
          font: {
            size: 14,
            weight: 'bold',
          },
          padding: {
            top: 10,
          },
        },
        grid: {
          display: true,
          drawOnChartArea: true,
          drawTicks: true,
          color: 'rgba(52, 134, 50, 0.3)',
          tickBorderDash: [2, 2],
        },
      },  
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Number of Events',
          font: {
            size: 14,
            weight: 'bold',
          },
          padding: {
            bottom: 10,
          },
        },
        grid: {
          display: true,
          tickBorderDash: [2, 2],
          color: "rgba(52, 134, 50, 0.3)"
        },
      },
    },
  };

  return (
    <div style={{ width: '80%', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h3>Totals for the Last 24 Hours:</h3>
        <p>
          Left Clicks: {totals.Left} | 
          Right Clicks: {totals.Right} | 
          Middle Clicks: {totals.Middle} | 
          Keypresses: {totals.KeyPress}
        </p>
      </div>
      <Line options={options} data={chartData} />
    </div>
  );
}
