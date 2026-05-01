import json
from pathlib import Path
from prefab_ui.app import PrefabApp
from prefab_ui.components import (
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Column,
    Row,
    Text,
    H1,
    H2,
    H3,
    Muted,
    Separator,
    Link,
)
from prefab_ui.components.charts import (
    BarChart,
    ChartSeries,
    LineChart,
    PieChart,
    Sparkline,
)
from prefab_ui.rx import Rx
from prefab_ui.actions import SetState

# Fallback for ScatterChart
try:
    from prefab_ui.components.charts import ScatterChart
except ImportError:
    ScatterChart = LineChart

def build_gainer_dashboard(data, notes=None, dated_filename="Latest"):
    """Constructs the Prefab UI dashboard layout."""
    notes = notes or []
    
    # Process data for chart
    chart_data = []
    for company in data:
        try:
            price_val = float(company['price'].replace('$', '').replace(',', '').strip())
            # Handle "+1,878.95% (23.76B)" by taking the part before the %
            raw_change = company['year_change'].split('%')[0].replace('+', '').replace(',', '').strip()
            change_val = float(raw_change)
            chart_data.append({
                "symbol": company['symbol'],
                "name": company['name'],
                "price": price_val,
                "change": change_val,
                "display_label": f"{company['name']} ({company['symbol']})"
            })
        except:
            continue

    with PrefabApp(css_class="max-w-6xl mx-auto p-6 bg-slate-50 min-h-screen") as app:
        with Column(gap=6):
            # Header Section
            with Row(align="center", justify="between", css_class="bg-white p-6 rounded-xl shadow-sm border border-slate-200"):
                with Column(gap=1):
                    H1("🚀 Master Intelligence Dashboard", css_class="text-3xl font-extrabold text-slate-900")
                    with Row(gap=2, align="center"):
                        Muted(f"Tracking {len(data)} companies")
                        Separator(orientation="vertical", css_class="h-4")
                        Muted(f"Source: {dated_filename}")
                
                with Row(gap=4, align="center"):
                    Text("🎯 Quick Filter:", css_class="text-sm font-bold text-slate-500")
                    # Show first 8 symbols as quick filters
                    Link("Show All", href="/", target="_self", css_class="text-xs px-2 py-1 bg-slate-100 rounded hover:bg-slate-200 text-slate-600")
                    for company in data[:8]:
                        sym = company['symbol']
                        Link(sym, href=f"/?symbol={sym}", target="_self", css_class="text-xs px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 font-mono")
                    Link("Refresh", href="/", target="_self", css_class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-input hover:bg-accent h-10 py-2 px-4 bg-white text-slate-600 ml-auto")
            
            with Row(gap=6):
                # Full Width: Market Feed
                with Column(gap=4, css_class="w-full"):
                    H2("Market Intelligence Feed", css_class="text-xl font-bold")
                    
                    if chart_data:
                        # Sort by change descending and take top 15
                        top_gainers = sorted(chart_data, key=lambda x: x['change'], reverse=True)[:15]
                        
                        with Row(gap=4):
                            # Bar Chart (Left)
                            with Column(css_class="w-1/2"):
                                with Card(css_class="overflow-hidden border-none shadow-md h-full"):
                                    with CardHeader(css_class="bg-slate-900 text-white"):
                                        CardTitle("🏆 Top 15 Gainers")
                                    with CardContent(css_class="bg-white p-4"):
                                        BarChart(
                                            data=top_gainers,
                                            x_axis="display_label",
                                            series=[
                                                ChartSeries(data_key="change", label="Growth %", color="#10b981")
                                            ],
                                            horizontal=True,
                                            show_legend=False,
                                            css_class="h-[400px]"
                                        )

                            # Scatter Plot (Right)
                            with Column(css_class="w-1/2"):
                                with Card(css_class="overflow-hidden border-none shadow-md h-full"):
                                    with CardHeader(css_class="bg-slate-900 text-white"):
                                        CardTitle("📈 Portfolio Distribution")
                                    with CardContent(css_class="bg-white p-4"):
                                        ScatterChart(
                                            data=chart_data,
                                            x_axis="price",
                                            y_axis="change",
                                            label_key="display_label",
                                            series=[
                                                ChartSeries(data_key="change", label="Growth %", color="#3b82f6")
                                            ],
                                            tooltip_keys=["display_label", "price", "change"],
                                            show_legend=False,
                                            css_class="h-[400px]"
                                        )

                    with Column(gap=3):
                        if not data:
                            with Card():
                                with CardContent(css_class="p-8 text-center"):
                                    Text("No market data available.", css_class="text-slate-500 italic")
                                    Muted("Push data from the Firefox extension to populate this feed.")
                        else:
                            for company in data:
                                with Card(css_class="hover:shadow-lg transition-all border-slate-200"):
                                    with CardContent(css_class="p-5"):
                                        with Row(justify="between", align="center"):
                                            # Symbol & Name
                                            with Column(gap=1, css_class="w-1/3"):
                                                Text(company['symbol'], css_class="font-mono font-bold text-blue-600")
                                                Text(company['name'], css_class="text-sm text-slate-600 truncate")
                                            
                                            # Price
                                            with Column(align="center", css_class="w-1/4"):
                                                Muted("PRICE", css_class="text-[10px] font-bold")
                                                Text(company['price'], css_class="font-mono font-bold text-lg")
                                            
                                            # 52W Change
                                            with Column(align="end", css_class="w-1/3"):
                                                Muted("52-WEEK CHANGE", css_class="text-[10px] font-bold")
                                                # Handle potential extra data in the year_change string
                                                display_change = company['year_change'].split('(')[0].strip()
                                                Text(display_change, css_class="font-bold text-xl text-emerald-600" if "+" in display_change else "font-bold text-xl text-rose-600")

    return app
