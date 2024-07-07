import { useLoaderData } from "@remix-run/react";
import { json, LoaderFunction } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ChartData,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const prisma = new PrismaClient();

export const loader: LoaderFunction = async () => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const events = await prisma.inputEvent.findMany({
    where: {
      timestamp: {
        gte: oneHourAgo,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // Create 5-minute intervals
  const intervals = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(oneHourAgo);
    date.setMinutes(date.getMinutes() + i * 5);
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
    const intervalIndex = Math.floor((eventTime.getTime() - oneHourAgo.getTime()) / (5 * 60 * 1000));
    if (intervalIndex >= 0 && intervalIndex < 12) {
      const intervalKey = intervals[intervalIndex];
      data[intervalKey][event.eventType]++;
    }
  });

  return json({ data, intervals });
};

export default function Graph() {
  const { data, intervals } = useLoaderData<typeof loader>();

  const chartData: ChartData<'line'> = {
    labels: intervals.map(interval => {
      const date = new Date(interval);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }),
    datasets: [
      {
        label: 'Keypresses',
        data: intervals.map(interval => data[interval].KeyPress),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'Right Clicks',
        data: intervals.map(interval => data[interval].Right),
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'Left Clicks',
        data: intervals.map(interval => data[interval].Left),
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'Middle Clicks',
        data: intervals.map(interval => data[interval].Middle),
        borderColor: 'rgb(255, 206, 86)',
        backgroundColor: 'rgba(255, 206, 86, 0.5)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
        },
      },
      title: {
        display: true,
        text: 'Input Events Over Last Hour',
        font: {
          size: 16,
        },
        padding: {
          top: 10,
          bottom: 30,
        },
      },
    },
    scales: {
      x: {
        reverse: false, // Changed to false to show most recent data on the right
        grid: {
          display: false,
        },
        ticks: {
          font: {
            size: 12,
          },
          autoSkip: false,
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
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 10,
          font: {
            size: 12,
          },
        },
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
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
    },
  };

  return (
    <div style={{ width: '80%', margin: '0 auto' }}>
      <Line options={options} data={chartData} />
    </div>
  );
}
