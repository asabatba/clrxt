import chroma from "chroma-js";
import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import { sortBy } from "rambda";
import {
  ChangeEventHandler,
  FormEventHandler,
  FunctionComponent,
  useMemo,
  useState
} from "react";
import { Bubble } from "react-chartjs-2";
import { style } from "typestyle";
import { CSSProperties } from "typestyle/lib/types";
import type { Cluster, ProcessOutput } from "./api/analyze_image";

const column: CSSProperties = { display: "flex", flexDirection: "column" };
const row: CSSProperties = { display: "flex", flexDirection: "row" };

const FileUploader: FunctionComponent<{ setData: (d: any) => void }> = ({
  setData,
}) => {
  const [fileInput, setFileInput] = useState<HTMLInputElement>();

  const upload = () => {
    if (!fileInput || !fileInput.files) return;
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    fetch("/api/analyze_image", {
      method: "POST",
      body: formData,
      headers: {
        "Accept-Type": "application/json",
      },
    })
      .then((r) => r.json())
      .then(setData);
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = (ev) => {
    ev.preventDefault();
    upload();
  };

  const onChange: ChangeEventHandler<HTMLInputElement> = (ev) => {
    setFileInput(ev.currentTarget);
    upload();
  };

  return (
    <div>
      <form
        action="/api/analyze_image"
        encType="multipart/form-data"
        method="POST"
        onSubmit={onSubmit}
      >
        <input
          className={style(coolInput())}
          onChange={onChange}
          name="file"
          type="file"
        />
        <button className={style(coolInput())}>submit</button>
      </form>
    </div>
  );
};

const styles: { [k: string]: CSSProperties } = {
  main: {},
  container: {
    padding: "1rem",
    background: "#050505",
    color: "#fefefe",
    width: "100%",
    height: "100%",
    overflowY: "auto",
  },
};

const colorBox = (front: string, back: string): CSSProperties => ({
  flexGrow: 1,
  border: "1px solid black",
  fontSize: "14pt",
  backgroundColor: back,
  color: front,
  padding: "0.8rem",
  textAlign: "end",
});

const coolInput = (): CSSProperties => ({
  padding: "0.8rem",
  borderRadius: "8px",
});

const ImgAnalysis: FunctionComponent<{ data: ProcessOutput }> = ({ data }) => {
  return (
    <div
      className={style({
        display: "flex",
        flexFlow: "column",
        fontFamily: "monospace",
      })}
    >
      <div>c1 - c2 - count - contrast - colordiff - distab - hipscore</div>
      {data.combos.map(
        ({
          c1: { hex: hex1, count: count1 },
          c2: { hex: hex2, count: count2 },
          contrast,
          colorDiff,
          distAb,
          hipScore,
        }) => {
          return (
            <div
              key={hex1 + hex2}
              className={style({
                display: "flex",
                flexDirection: "row",
                // backgroundColor: c2, color: c1,
                alignItems: "center",
                padding: "0.4rem",
              })}
            >
              <div className={style(colorBox(hex2, hex1))}>{hex1}</div>
              <div className={style(colorBox(hex1, hex2))}>{hex2}</div>
              <div className={style(colorBox("black", "white"), {})}>
                {count1 + count2}
              </div>
              <div
                className={style(colorBox("black", "white"), {
                  // width: "6rem",
                })}
              >
                {contrast.toFixed(2)}
              </div>
              <div
                className={style(colorBox("black", "white"), {
                  // width: "6rem",
                })}
              >
                {colorDiff.toFixed(2)}
              </div>
              <div
                className={style(colorBox("black", "white"), {
                  // width: "6rem",
                })}
              >
                {distAb.toFixed(2)}
              </div>
              <div
                className={style(colorBox("black", "white"), {
                  // opacity: weighted,
                  // width: "8rem",
                })}
              >
                {hipScore.toFixed(3)}
              </div>
            </div>
          );
        }
      )}
    </div>
  );
};

const ColorGrid: FunctionComponent<{ data: ProcessOutput }> = ({ data }) => {
  const sortableFields: (keyof Cluster)[] = ["abHip", "count", "luminance"];
  const [sortField, setSortField] = useState<keyof Cluster>("count");
  const onChange: ChangeEventHandler<HTMLSelectElement> = (ev) => {
    ev.preventDefault();
    setSortField(ev.currentTarget.value as any);
  };
  const sortedClusters = useMemo(() => {
    return sortBy((c) => -c[sortField] as number, data.clusters);
  }, [data, sortField]);
  return (
    <div>
      <div>
        <select onChange={onChange} value={sortField}>
          {sortableFields.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div
        className={style({
          display: "grid",
          gridTemplateColumns: "repeat(4, auto)",
        })}
      >
        {sortedClusters.map((c, idx) => {
          return (
            <div
              key={c.hex}
              className={style({
                display: "flex",
                fontFamily: "monospace",
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                background: c.hex,
                // width: "48ch",
                padding: "0.8rem",
                // height: "6ch",
                color: chroma.contrast("black", c.hex) > 5 ? "black" : "white",
              })}
            >
              <span
                className={style({
                  fontSize: "18pt",
                  width: "3ch",
                  marginRight: "0.4rem",
                })}
              >
                {idx + 1}
              </span>
              <div className={style(column, { flexGrow: 1 })}>
                <span>{c.lab.map((v) => v.toFixed(2)).join(", ")}</span>
                <span>
                  {Object.values(c.labStdev)
                    .map((v) => v.toFixed(1))
                    .join(", ")}
                </span>
              </div>
              <span>{(c[sortField] as number).toFixed(2)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Example: FunctionComponent<{ primary: any; secondary: any }> = ({
  primary,
  secondary,
}) => {
  // const fg =  primary.fg.hex;
  // const bg = primary.bg.hex;
  const [fg, bg] =
    chroma(primary.fg.hex).luminance() > 0.5
      ? [primary.fg.hex, primary.bg.hex]
      : [primary.bg.hex, primary.fg.hex];
  return (
    <div
      className={style({
        padding: "1rem",
        fontSize: "16pt",
        // backgroundColor: primary.bg.hex,
        // color: primary.fg.hex,
      })}
    >
      <button
        className={style({
          // fontFamily:'sans-serif',
          padding: "0.4rem 1rem",
          borderRadius: "6px 6px 0 0",
          border: "none",
          backgroundColor: bg,
          color: fg,
        })}
      >
        button
      </button>
      <div
        className={style({
          padding: "0.4rem",
          borderRadius: 2,
          minHeight: "12ch",
          backgroundColor: secondary.bg.hex,
          color: secondary.fg.hex,
        })}
      >
        lorem ipsum dolor sit amet
      </div>
    </div>
  );
};

const Palette: FunctionComponent<{ clusters: Cluster[] }> = ({ clusters }) => {
  return (
    <div className={style({ display: "flex", flexDirection: "row" })}>
      {clusters.map((c) => (
        <div
          key={c.hex}
          className={style({ padding: "1rem", backgroundColor: c.hex })}
        >
          {c.hex}
        </div>
      ))}
    </div>
  );
};

const Home: NextPage = () => {
  const [data, setData] = useState<ProcessOutput>();

  const _data = data;
  return (
    <div className={style(styles.container)}>
      <Head>
        <title>ClrXt</title>
        <meta name="description" content="ey there" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={style(styles.main, { fontFamily: "monospace" })}>
        <h1>color extractor</h1>
        <div className={style(row, { alignItems: "center" })}>
          <FileUploader setData={setData} />
          <div className={style({ width: "2rem" })} />
          {_data && (
            <Image
              src={_data.img}
              layout="fixed"
              width={64}
              height={64}
              // className={style({ height: 64, width: 64 })}
              alt="uploaded img"
            />
          )}
        </div>
        {_data && (
          <>
            <div className={style({ width: 800, height: 400 })}>
              <Bubble
                data={{
                  datasets: [
                    {
                      data: _data.clusters.map((c: Cluster) => ({
                        x: c.lab[1],
                        y: c.lab[2],
                        r: c.count ** (1 / 2.6) + 5,
                      })),
                      label: "colors",
                      // label: _data.clusters.map(c=>c.hex),
                      backgroundColor: _data.clusters.map((c) => c.hex),
                      borderColor: _data.clusters.map((c) =>
                        chroma(c.hex).luminance() < 0.5 ? "white" : "black"
                      ),
                    },
                  ],
                }}
              />
            </div>
            <ColorGrid data={_data} />
            <ImgAnalysis data={_data} />
            <Example
              primary={{ fg: _data.combos[0].c1, bg: _data.combos[0].c2 }}
              secondary={{ fg: _data.combos[1].c1, bg: _data.combos[1].c2 }}
            />
            <Palette clusters={_data.palette} />
          </>
        )}
      </main>

      {/* <footer className={styles.footer}>

      </footer> */}
    </div>
  );
};

export default Home;
